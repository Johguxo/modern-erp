// Editar un borrador propio (requests.create): reemplaza encabezado y líneas con bloqueo optimista
// (`version`). Solo en borrador; después del envío, E4 decide cómo se corrige.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { assertEditable } from '../domain/request';

import { resolveDraft, type LineDraft } from './catalog-snapshot';
import { normalizeBlank } from './normalize';
import type { DraftDeps } from './ports';
import { assertVersion, lockOwnRequest } from './request-access';
import { toRequestView, type RequestView } from './views';

export interface UpdateDraftInput {
  readonly id: string;
  /** La versión que el cliente vio al abrir el borrador. */
  readonly version: number;
  readonly costCenterId: string | null;
  readonly equipmentId: string | null;
  readonly reason: string | null;
  readonly lines: readonly LineDraft[];
}

export async function updateDraft(
  ctx: Ctx,
  input: UpdateDraftInput,
  deps: DraftDeps,
): Promise<RequestView> {
  requirePermission(ctx, 'requests.create');

  const current = await lockOwnRequest(ctx, deps.requests, input.id);
  assertEditable(current.request.status);
  assertVersion(current.request.version, input.version);

  const resolved = await resolveDraft(
    ctx,
    {
      currency: current.request.currency,
      header: { costCenterId: input.costCenterId, equipmentId: input.equipmentId },
      lines: input.lines,
    },
    deps.catalog,
  );

  const lines = await deps.requests.replaceLines(ctx.tenantId, current.request.id, resolved.lines);
  const request = await deps.requests.updateHeader(
    ctx.tenantId,
    current.request.id,
    current.request.version,
    {
      costCenterId: input.costCenterId,
      equipmentId: input.equipmentId,
      reason: normalizeBlank(input.reason),
      totalAmount: resolved.totalAmount,
    },
  );

  await recordAudit(
    ctx,
    {
      action: 'request.updated',
      entityType: 'request',
      entityId: request.id,
      data: {
        lineCount: lines.length,
        totalAmount: request.totalAmount,
        previousTotalAmount: current.request.totalAmount,
        version: request.version,
      },
    },
    deps,
  );
  return toRequestView(request, lines);
}
