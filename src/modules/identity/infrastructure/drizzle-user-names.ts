// Nombres de usuarios del tenant activo con la transacción de withTenant: RLS (users_read) y filtro
// explícito por membresía en el tenant, para no revelar usuarios de otras empresas.
import { and, eq, inArray } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { memberships, users } from '@/db/schema';

export function createDrizzleUserNames(
  db: DbExecutor,
): (tenantId: string, userIds: readonly string[]) => Promise<ReadonlyMap<string, string>> {
  return async (tenantId, userIds) => {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(eq(memberships.tenantId, tenantId), inArray(users.id, ids)));
    return new Map(rows.map((row) => [row.id, row.fullName]));
  };
}
