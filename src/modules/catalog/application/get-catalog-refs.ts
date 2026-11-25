// Referencias activas del catálogo por id (productos, equipos y centros de costo) para los módulos
// que arman documentos con ellas (requests). Solo lectura: catalog.manage o requests.create.
import type { Ctx } from '@/shared/context';

import { requireCatalogRead } from './master-data';
import type {
  CostCenterDeps,
  CostCenterView,
  EquipmentDeps,
  EquipmentView,
  ProductDeps,
  ProductView,
} from './ports';

export interface CatalogRefsInput {
  readonly productIds: readonly string[];
  readonly equipmentIds: readonly string[];
  readonly costCenterIds: readonly string[];
}

export interface CatalogRefs {
  readonly products: ProductView[];
  readonly equipment: EquipmentView[];
  readonly costCenters: CostCenterView[];
}

export async function getCatalogRefs(
  ctx: Ctx,
  input: CatalogRefsInput,
  deps: Pick<ProductDeps, 'products'> &
    Pick<EquipmentDeps, 'equipment'> &
    Pick<CostCenterDeps, 'costCenters'>,
): Promise<CatalogRefs> {
  requireCatalogRead(ctx);
  const [products, equipment, costCenters] = await Promise.all([
    deps.products.findActiveByIds(ctx.tenantId, unique(input.productIds)),
    deps.equipment.findActiveByIds(ctx.tenantId, unique(input.equipmentIds)),
    deps.costCenters.findActiveByIds(ctx.tenantId, unique(input.costCenterIds)),
  ]);
  return { products, equipment, costCenters };
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];
