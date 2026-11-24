// Invitaciones (E1-H3) con la transacción de withTenant: RLS y filtro explícito por tenantId.
// app_user inserta y solo actualiza roles, token_hash, expires_at, invited_by y updated_at
// (grants de 0002); accepted_at solo lo escribe el caso de aceptar (getDbAdmin).
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { invitations, users } from '@/db/schema';

import type { InvitationRecord, InvitationRepository } from '../application/user-admin-ports';

import { toRoles } from './roles';

const columns = {
  id: invitations.id,
  email: invitations.email,
  roles: invitations.roles,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  invitedByName: users.fullName,
};

type Row = {
  id: string;
  email: string;
  roles: string[];
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedByName: string | null;
};

function toRecord(row: Row): InvitationRecord {
  return { ...row, roles: toRoles(row.roles) };
}

export function createDrizzleInvitationRepository(db: DbExecutor): InvitationRepository {
  const base = () =>
    db.select(columns).from(invitations).leftJoin(users, eq(users.id, invitations.invitedBy));

  const pending = (tenantId: string) =>
    and(eq(invitations.tenantId, tenantId), isNull(invitations.acceptedAt));

  return {
    async listLive(tenantId, now) {
      const rows = await base()
        .where(and(pending(tenantId), gt(invitations.expiresAt, now)))
        .orderBy(desc(invitations.createdAt));
      return rows.map(toRecord);
    },

    async findPendingByEmail(tenantId, email) {
      const [row] = await base()
        .where(and(pending(tenantId), eq(invitations.email, email)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async findPendingById(tenantId, invitationId) {
      const [row] = await base()
        .where(and(pending(tenantId), eq(invitations.id, invitationId)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async create(input) {
      const [row] = await db
        .insert(invitations)
        .values({ ...input, roles: [...input.roles] })
        .returning({ id: invitations.id });
      if (!row) throw new Error('Invitation insert returned no row');
      return row.id;
    },

    async renew(tenantId, invitationId, input) {
      await db
        .update(invitations)
        .set({
          roles: [...input.roles],
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          invitedBy: input.invitedBy,
        })
        .where(and(pending(tenantId), eq(invitations.id, invitationId)));
    },

    async expire(tenantId, invitationId, now) {
      await db
        .update(invitations)
        .set({ expiresAt: now })
        .where(and(pending(tenantId), eq(invitations.id, invitationId)));
    },
  };
}
