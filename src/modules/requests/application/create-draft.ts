// Crear un borrador de SOF (requests.create). El borrador no consume número. La moneda es la de la
// empresa (G3) y el almacén el principal; precios y totales salen del servidor.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { resolveDraft, type LineDraft } from './catalog-snapshot';
import { normalizeBlank } from './normalize';
import type { DraftDeps } from './ports';
import { toRequestView, type RequestView } from './views';

export interface CreateDraftInput {
  readonly costCenterId: string | null;
  readonly equipmentId: string | null;
  readonly reason: string | null;
  readonly lines: readonly LineDraft[];
}

export async function createDraft(
  ctx: Ctx,
  input: CreateDraftInput,
  deps: DraftDeps,
): Promise<RequestView> {
  requirePermission(ctx, 'requests.create');

  const [currency, warehouseId] = await Promise.all([
    deps.currency.currencyOf(ctx.tenantId),
    deps.catalog.defaultWarehouseId(ctx),
  ]);
  const resolved = await resolveDraft(
    ctx,
    {
      currency,
      header: { costCenterId: input.costCenterId, equipmentId: input.equipmentId },
      lines: input.lines,
    },
    deps.catalog,
  );

  const created = await deps.requests.create(
    {
      tenantId: ctx.tenantId,
      requesterId: ctx.userId,
      costCenterId: input.costCenterId,
      warehouseId,
      equipmentId: input.equipmentId,
      reason: normalizeBlank(input.reason),
      currency,
      totalAmount: resolved.totalAmount,
    },
    resolved.lines,
  );

  await recordAudit(
    ctx,
    {
      action: 'request.created',
      entityType: 'request',
      entityId: created.request.id,
      data: {
        lineCount: created.lines.length,
        totalAmount: created.request.totalAmount,
        currency,
      },
    },
    deps,
  );
  return toRequestView(created.request, created.lines);
}
