// Puerto CatalogLookup sobre el módulo catalog (solo por su index, ADR-001): valida y copia lo
// activo del tenant usando el caso de uso de lectura del catálogo, con su permiso y su RLS.
import type { DbExecutor } from '@/db';
import {
  createCatalogDeps,
  getCatalogRefs,
  getDefaultWarehouse,
  type CatalogExtras,
} from '@/modules/catalog';

import type { CatalogLookup } from '../application/ports';

export function createCatalogLookup(tx: DbExecutor, extras: CatalogExtras): CatalogLookup {
  const deps = createCatalogDeps(tx, extras);
  return {
    async refs(ctx, ids) {
      const refs = await getCatalogRefs(ctx, ids, deps);
      return {
        products: refs.products.map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          unit: product.unit,
          referencePrice: product.referencePrice,
          currency: product.currency,
        })),
        equipmentIds: refs.equipment.map((item) => item.id),
        costCenterIds: refs.costCenters.map((item) => item.id),
      };
    },

    async defaultWarehouseId(ctx) {
      return (await getDefaultWarehouse(ctx, deps)).id;
    },
  };
}
