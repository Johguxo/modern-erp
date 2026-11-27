// Anular un SOF (E3-H5). Todo en la transacción de withTenant:
//   1. bloquea la solicitud (FOR UPDATE) y revisa que el usuario la vea (404 si no);
//   2. máquina de estados (409), derecho a anular (403) y versión (409), en ese orden;
//   3. pasa a cancelled con fecha, autor y comentario, cierra la aprobación y audita.
// Si cualquier paso lanza, la transacción se revierte entera.
import { recordAudit } from '@/modules/identity';
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { assertCanCancel, normalizeCancelComment } from '../domain/cancellation';

import type { CancelDeps } from './ports';
import { assertVersion, lockVisibleRequest } from './request-access';
import { toRequestView, type RequestView } from './views';

export interface CancelRequestInput {
  readonly id: string;
  readonly version: number;
  readonly comment: string;
}

export async function cancelRequest(
  ctx: Ctx,
  input: CancelRequestInput,
  deps: CancelDeps,
): Promise<RequestView> {
  requireAnyPermission(ctx, ['requests.create', 'requests.cancel_any']);
  const comment = normalizeCancelComment(input.comment);

  const { request, lines } = await lockVisibleRequest(ctx, input.id, deps);
  const status = assertCanCancel(request, ctx);
  assertVersion(request.version, input.version);

  // Anulado, ya nadie debe reconfirmar nada (E4-H4): no quedan marcas huérfanas.
  await deps.requests.clearReconfirmation(ctx.tenantId, request.id);
  const cancelled = await deps.requests.updateHeader(ctx.tenantId, request.id, request.version, {
    status,
    closedAt: deps.clock.now(),
    closedBy: ctx.userId,
    closeComment: comment,
  });

  await deps.canceller.cancel(ctx, { requestId: cancelled.id, comment });

  await recordAudit(
    ctx,
    {
      action: 'request.cancelled',
      entityType: 'request',
      entityId: cancelled.id,
      data: { number: request.number, fromStatus: request.status, comment },
    },
    deps,
  );
  return toRequestView(
    cancelled,
    lines.map((line) => ({ ...line, needsReconfirmation: false })),
  );
}
