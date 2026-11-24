// Bloqueos por tenant y nombre de la empresa (E1-H3). app_user no puede bloquear tenants ni
// subscriptions con FOR UPDATE: se usa pg_advisory_xact_lock, que se libera al terminar la
// transacción. Las claves son `seats:<tenant>` (cupos) y `admins:<tenant>` (último admin).
import { eq, sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { tenants } from '@/db/schema';
import { NotFoundError } from '@/shared/errors';

import type { TenantDirectory, TenantLocks } from '../application/user-admin-ports';

export function createDrizzleTenantLocks(db: DbExecutor): TenantLocks {
  return {
    async seats(tenantId) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('seats:' || ${tenantId}))`);
    },
    async admins(tenantId) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('admins:' || ${tenantId}))`);
    },
  };
}

export function createDrizzleTenantDirectory(db: DbExecutor): TenantDirectory {
  return {
    async tenantName(tenantId) {
      const [row] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!row) throw new NotFoundError({ message: 'Tenant not found' });
      return row.name;
    },
  };
}
