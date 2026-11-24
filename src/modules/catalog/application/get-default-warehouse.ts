// Almacén por defecto del cliente (en el MVP hay uno solo; lo crea el alta del tenant).
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { requireCatalogRead } from './master-data';
import type { WarehouseDeps, WarehouseView } from './ports';

export async function getDefaultWarehouse(ctx: Ctx, deps: WarehouseDeps): Promise<WarehouseView> {
  requireCatalogRead(ctx);
  const warehouse = await deps.warehouses.findDefault(ctx.tenantId);
  if (!warehouse) throw new NotFoundError({ message: 'Default warehouse not found' });
  return warehouse;
}
