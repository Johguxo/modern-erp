// Miembros de la empresa (E1-H3) con la transacción de withTenant: RLS (memberships y users_read)
// y además filtro explícito por tenantId. app_user solo puede actualizar roles, status y
// updated_at de memberships (grants de 0002).
import { and, asc, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { memberships, users } from '@/db/schema';
import type { Role } from '@/shared/permissions';

import type { MemberRecord, MemberRepository, MemberStatus } from '../application/user-admin-ports';

import { toRoles } from './roles';

const columns = {
  membershipId: memberships.id,
  userId: users.id,
  fullName: users.fullName,
  email: users.email,
  roles: memberships.roles,
  membershipStatus: memberships.status,
  userStatus: users.status,
};

type Row = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
  membershipStatus: string;
  userStatus: string;
};

function toRecord(row: Row): MemberRecord {
  const membershipStatus: MemberStatus = row.membershipStatus === 'active' ? 'active' : 'disabled';
  return {
    membershipId: row.membershipId,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    roles: toRoles(row.roles),
    membershipStatus,
    status: membershipStatus === 'active' && row.userStatus === 'active' ? 'active' : 'disabled',
  };
}

export function createDrizzleMemberRepository(db: DbExecutor): MemberRepository {
  const base = () =>
    db.select(columns).from(memberships).innerJoin(users, eq(users.id, memberships.userId));

  return {
    async list(tenantId) {
      const rows = await base()
        .where(eq(memberships.tenantId, tenantId))
        .orderBy(asc(users.fullName), asc(users.email));
      return rows.map(toRecord);
    },

    async findById(tenantId, membershipId) {
      const [row] = await base()
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async findByEmail(tenantId, email) {
      const [row] = await base()
        .where(and(eq(memberships.tenantId, tenantId), eq(users.email, email)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async updateRoles(tenantId, membershipId, roles: readonly Role[]) {
      await db
        .update(memberships)
        .set({ roles: [...roles] })
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
    },

    async updateStatus(tenantId, membershipId, status) {
      await db
        .update(memberships)
        .set({ status })
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId)));
    },
  };
}
