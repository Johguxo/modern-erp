// Cerrar la aprobación de un documento anulado (E4-H2). Corre dentro de la transacción de la
// anulación, con la solicitud ya bloqueada: bloquea la última instancia, cierra los pasos abiertos
// y escribe el evento `cancelled`. Un documento que nunca se envió no tiene instancia: solo queda
// el evento.
import type { Ctx } from '@/shared/context';

import type { ApprovalEngineDeps } from './ports';

export interface CancelApprovalInput {
  readonly requestId: string;
  readonly comment: string;
}

export async function cancelApproval(
  ctx: Ctx,
  input: CancelApprovalInput,
  deps: ApprovalEngineDeps,
): Promise<void> {
  const { tenantId } = ctx;
  const latest = await deps.instances.lockLatest(tenantId, input.requestId);
  if (latest?.status === 'in_progress') {
    const now = deps.clock.now();
    await deps.instances.cancelOpenSteps(tenantId, latest.id, now);
    await deps.instances.closeInstance(tenantId, latest.id, 'cancelled', now);
  }
  await deps.events.append(tenantId, {
    requestId: input.requestId,
    instanceId: latest?.id ?? null,
    stepId: null,
    type: 'cancelled',
    actorUserId: ctx.userId,
    comment: input.comment,
    data: latest ? { round: latest.round } : {},
  });
}
