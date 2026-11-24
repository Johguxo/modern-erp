// Aceptar invitación (E1-H3) con la conexión dueño (getDbAdmin, ADR-004 §8): aún no hay tenant
// activo para RLS. Acotado: toda consulta parte del token_hash de la invitación o de su tenant y
// correo, y la escritura se audita (el caso de uso registra audit_events en la misma transacción).
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { DbExecutor, DbTransaction } from '@/db';
import { invitations, memberships, tenants, users } from '@/db/schema';

import type {
  AcceptableInvitation,
  AcceptUnitOfWork,
  Account,
  InvitationAcceptStore,
} from '../application/invitation-accept-ports';

import { createDrizzleAuditLog } from './drizzle-audit-log';
import { createDrizzleEntitlementsRepository } from './drizzle-entitlements-repository';
import { toRoles } from './roles';

const invitationColumns = {
  id: invitations.id,
  tenantId: invitations.tenantId,
  email: invitations.email,
  roles: invitations.roles,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
};

function toInvitation(row: {
  id: string;
  tenantId: string;
  email: string;
  roles: string[];
  expiresAt: Date;
  acceptedAt: Date | null;
}): AcceptableInvitation {
  return { ...row, roles: toRoles(row.roles) };
}

async function findAccount(db: DbExecutor, email: string): Promise<Account | null> {
  const [row] = await db
    .select({ userId: users.id, authUserId: users.authUserId, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    authUserId: row.authUserId,
    status: row.status === 'active' ? 'active' : 'disabled',
  };
}

function unitOfWork(tx: DbTransaction): AcceptUnitOfWork {
  return {
    async lockInvitation(tokenHash) {
      const [row] = await tx
        .select(invitationColumns)
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .for('update')
        .limit(1);
      return row ? toInvitation(row) : null;
    },

    async lockSeats(tenantId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('seats:' || ${tenantId}))`);
    },

    loadAccessStatus: (tenantId) => createDrizzleEntitlementsRepository(tx).loadStatus(tenantId),

    findAccount: (email) => findAccount(tx, email),

    async createUser(input) {
      const [row] = await tx.insert(users).values(input).returning({ id: users.id });
      if (!row) throw new Error('User insert returned no row');
      return row.id;
    },

    async linkAuthUser(userId, authUserId) {
      await tx
        .update(users)
        .set({ authUserId })
        .where(and(eq(users.id, userId), isNull(users.authUserId)));
    },

    async findMembership(tenantId, userId) {
      const [row] = await tx
        .select({ id: memberships.id, status: memberships.status })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)))
        .limit(1);
      if (!row) return null;
      return { id: row.id, status: row.status === 'active' ? 'active' : 'disabled' };
    },

    async createMembership(input) {
      const [row] = await tx
        .insert(memberships)
        .values({ ...input, roles: [...input.roles], status: 'active' })
        .returning({ id: memberships.id });
      if (!row) throw new Error('Membership insert returned no row');
      return row.id;
    },

    async reactivateMembership(tenantId, membershipId, roles) {
      await tx
        .update(memberships)
        .set({ status: 'active', roles: [...roles] })
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
    },

    async markAccepted(invitationId, now) {
      await tx
        .update(invitations)
        .set({ acceptedAt: now })
        .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)));
    },

    audit: createDrizzleAuditLog(tx),
  };
}

export function createDrizzleInvitationAcceptStore(db: DbExecutor): InvitationAcceptStore {
  return {
    async preview(tokenHash) {
      const [row] = await db
        .select({ ...invitationColumns, tenantName: tenants.name })
        .from(invitations)
        .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
        .where(and(eq(invitations.tokenHash, tokenHash), isNull(invitations.acceptedAt)))
        .limit(1);
      if (!row) return null;
      const { tenantName, ...invitation } = row;
      return {
        invitation: toInvitation(invitation),
        tenantName,
        account: await findAccount(db, invitation.email),
      };
    },

    transaction: (fn) => db.transaction((tx) => fn(unitOfWork(tx))),
  };
}
