// Editar un borrador propio (requests.create), o un SOF en «Cambios solicitados» antes de reenviarlo:
// reemplaza el encabezado y las líneas (en sitio si ya se envió) con bloqueo optimista (`version`).
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { planLineSync } from '../domain/line-sync';
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

  // Borrador: se reemplazan las líneas. Ya enviado («Cambios solicitados»): edición en sitio, porque
  // las revisiones apuntan a las líneas (E4-H4).
  const lines =
    current.request.status === 'draft'
      ? await deps.requests.replaceLines(ctx.tenantId, current.request.id, resolved.lines)
      : await deps.requests.syncLines(
          ctx.tenantId,
          current.request.id,
          planLineSync(current.lines, resolved.lines),
        );
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
        lineCount: lines.filter((line) => line.status === 'active').length,
        totalAmount: request.totalAmount,
        previousTotalAmount: current.request.totalAmount,
        version: request.version,
      },
    },
    deps,
  );
  return toRequestView(request, lines);
}
