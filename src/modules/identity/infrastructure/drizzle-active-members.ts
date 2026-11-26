// Miembros activos del tenant (membresía y usuario activos) con sus roles, para que otros módulos
// resuelvan aprobadores (E4-H1). Usa la transacción de withTenant (RLS) y filtra por tenantId.
import { and, asc, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { memberships, users } from '@/db/schema';
import type { Role } from '@/shared/permissions';

import { toRoles } from './roles';

export interface ActiveMember {
  readonly userId: string;
  readonly fullName: string;
  readonly roles: readonly Role[];
}

export function createDrizzleActiveMembers(
  db: DbExecutor,
): (tenantId: string) => Promise<readonly ActiveMember[]> {
  return async (tenantId) => {
    const rows = await db
      .select({ userId: users.id, fullName: users.fullName, roles: memberships.roles })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.status, 'active'),
          eq(users.status, 'active'),
        ),
      )
      .orderBy(asc(users.fullName), asc(users.email));
    return rows.map((row) => ({
      userId: row.userId,
      fullName: row.fullName,
      roles: toRoles(row.roles),
    }));
  };
}
