// Datos que necesita el editor de SOF, en una sola transacción con RLS: centros de costo y equipos
// activos (hasta 100: más se pasaría a un combobox con búsqueda), la vista previa de la ruta de
// aprobación y, al editar, el borrador propio. Un borrador ajeno o enviado lanza NotFoundError.
import { withTenant } from '@/db';
import { createPreviewRouteDeps, previewRoute, type RoutePreview } from '@/modules/approvals';
import {
  createCatalogDeps,
  listCostCenters,
  listEquipment,
  type CostCenterView,
  type EquipmentView,
} from '@/modules/catalog';
import { createTenantCurrencyFor } from '@/modules/identity';
import { createGetRequestDeps, getEditableDraft, type RequestView } from '@/modules/requests';
import type { Currency } from '@/modules/requests/contracts';
import type { Ctx } from '@/shared/context';

import { readOnlyCatalogExtras } from '../../../_lib/catalog';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
}

export interface EditorData {
  readonly costCenters: SelectOption[];
  readonly equipment: SelectOption[];
  readonly route: RoutePreview;
  readonly currency: Currency;
  readonly draft: RequestView | null;
}

const ACTIVE_FIRST_PAGE = { q: null, status: 'active', page: 1, pageSize: 100 } as const;

const toOption = (item: CostCenterView | EquipmentView): SelectOption => ({
  id: item.id,
  label: `${item.code} · ${item.name}`,
});

export function loadEditorData(ctx: Ctx, draftId?: string): Promise<EditorData> {
  return withTenant(ctx, async (tx) => {
    const catalog = createCatalogDeps(tx, readOnlyCatalogExtras());
    // El borrador va primero: su total decide la ruta inicial y su moneda es la del documento.
    const draft = draftId
      ? await getEditableDraft(ctx, { id: draftId }, createGetRequestDeps(tx))
      : null;
    const [costCenters, equipment, route, currency] = await Promise.all([
      listCostCenters(ctx, ACTIVE_FIRST_PAGE, catalog),
      listEquipment(ctx, ACTIVE_FIRST_PAGE, catalog),
      previewRoute(
        ctx,
        { docType: 'SOF', total: draft ? draft.totalAmount : null },
        createPreviewRouteDeps(tx),
      ),
      // Misma fuente que createDraft: tenant_settings.currency.
      draft ? draft.currency : createTenantCurrencyFor(tx)(ctx.tenantId),
    ]);
    return {
      costCenters: costCenters.items.map(toOption),
      equipment: equipment.items.map(toOption),
      route,
      currency,
      draft,
    };
  });
}
