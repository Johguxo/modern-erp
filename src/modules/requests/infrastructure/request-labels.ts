// Puerto RequestLabels sobre identity y catalog (solo por sus index, ADR-001 §10): resuelve en lote
// los nombres de solicitantes y los rótulos de equipo/centro de costo de las filas de la bandeja.
import type { DbExecutor } from '@/db';
import { createCatalogDeps, getCatalogLabels, type CatalogExtras } from '@/modules/catalog';
import { createUserNamesFor } from '@/modules/identity';

import type { RequestLabels } from '../application/ports';

export function createRequestLabels(tx: DbExecutor, extras: CatalogExtras): RequestLabels {
  const userNames = createUserNamesFor(tx);
  const catalog = createCatalogDeps(tx, extras);
  return {
    userNames: (ctx, userIds) => userNames(ctx.tenantId, userIds),

    async areaLabels(ctx, ids) {
      const labels = await getCatalogLabels(ctx, ids, catalog);
      return {
        equipment: new Map(
          labels.equipment.map((item) => [item.id, `${item.code} · ${item.name}`]),
        ),
        costCenters: new Map(labels.costCenters.map((item) => [item.id, item.name])),
      };
    },
  };
}
