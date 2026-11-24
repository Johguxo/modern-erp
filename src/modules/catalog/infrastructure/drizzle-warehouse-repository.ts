// Almacenes del tenant activo (solo lectura para app_user: grants de 0006).
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { warehouses } from '@/db/schema';

import type { WarehouseRepository } from '../application/ports';

export function createDrizzleWarehouseRepository(db: DbExecutor): WarehouseRepository {
  return {
    async findDefault(tenantId) {
      const [row] = await db
        .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name })
        .from(warehouses)
        .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isDefault, true)))
        .limit(1);
      return row ?? null;
    },
  };
}
