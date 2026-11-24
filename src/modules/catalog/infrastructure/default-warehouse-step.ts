// Paso de alta del tenant (E2-H1): crea el Almacén principal dentro de la misma transacción de la
// consola de plataforma (getDbAdmin). Solo inserta en el tenant recibido y es idempotente.
import { warehouses } from '@/db/schema';
import type { TenantSetupStepFactory } from '@/modules/identity';

import { DEFAULT_WAREHOUSE } from '../domain/warehouse';

export const defaultWarehouseSetupStep: TenantSetupStepFactory = (db) => ({
  async run({ tenantId }) {
    await db
      .insert(warehouses)
      .values({
        tenantId,
        code: DEFAULT_WAREHOUSE.code,
        name: DEFAULT_WAREHOUSE.name,
        isDefault: true,
      })
      .onConflictDoNothing();
  },
});
