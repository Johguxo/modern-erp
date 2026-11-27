// Decidir un SOF (E4-H2): aprobar el paso, pedir cambios o rechazar. Todo en la transacción de
// withTenant:
//   1. permiso `approvals.decide` y comentario (obligatorio al rechazar y al pedir cambios);
//   2. bloquea la solicitud (FOR UPDATE) y revisa que el usuario la vea (404 si no);
//   3. nadie decide su propia solicitud (403 `own_request`);
//   4. el motor de aprobaciones decide el paso (bloquea la instancia, aplica any/all, escribe los
//      eventos) y dice cómo queda la ronda;
//   5. el estado que resulta debe ser una transición válida y la versión la vigente (409 si no);
//   6. actualiza el documento (estado, fechas y versión) y audita.
// La versión se revisa después del motor: con la regla `any`, quien llega segundo recibe
// `step_already_decided` y no un error de versión. Si cualquier paso lanza, se revierte todo.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ForbiddenError } from '@/shared/errors';

import {
  normalizeDecisionComment,
  statusAfterDecision,
  type DecisionKind,
  type DecisionOutcome,
} from '../domain/decision';

import type { DecideDeps } from './ports';
import { assertVersion, lockVisibleRequest } from './request-access';
import { toRequestView, type RequestView } from './views';

export interface DecideRequestInput {
  readonly id: string;
  readonly version: number;
  /** El paso pendiente que el usuario vio al abrir el documento. */
  readonly stepId: string;
  readonly decision: DecisionKind;
  readonly comment?: string | null;
}

export type DecideRequestOutput = RequestView & { readonly outcome: DecisionOutcome };

export async function decideRequest(
  ctx: Ctx,
  input: DecideRequestInput,
  deps: DecideDeps,
): Promise<DecideRequestOutput> {
  requirePermission(ctx, 'approvals.decide');
  const comment = normalizeDecisionComment(input.decision, input.comment);

  const { request, lines } = await lockVisibleRequest(ctx, input.id, deps);
  if (request.requesterId === ctx.userId) {
    throw new ForbiddenError({
      reason: 'own_request',
      message: `User ${ctx.userId} cannot decide their own request`,
    });
  }

  const { outcome } = await deps.decider.decide(ctx, {
    requestId: request.id,
    stepId: input.stepId,
    kind: input.decision,
    comment,
  });
  const status = statusAfterDecision(request.status, outcome);
  assertVersion(request.version, input.version);

  const now = deps.clock.now();
  // Si la ronda termina (aprobada, rechazada o con cambios pedidos), ya nadie debe reconfirmar nada
  // (E4-H4): no quedan marcas huérfanas.
  const settledRound =
    outcome === 'approved' || outcome === 'rejected' || outcome === 'changes_requested';
  if (settledRound) await deps.requests.clearReconfirmation(ctx.tenantId, request.id);
  const decided = await deps.requests.updateHeader(ctx.tenantId, request.id, request.version, {
    status,
    ...(outcome === 'approved' ? { approvedAt: now } : {}),
    ...(outcome === 'rejected' ? { closedAt: now } : {}),
  });

  await recordAudit(
    ctx,
    {
      action: 'request.decided',
      entityType: 'request',
      entityId: decided.id,
      data: {
        number: decided.number,
        decision: input.decision,
        outcome,
        stepId: input.stepId,
        fromStatus: request.status,
        toStatus: status,
        ...(comment !== null ? { comment } : {}),
      },
    },
    deps,
  );
  const settled = settledRound
    ? lines.map((line) => ({ ...line, needsReconfirmation: false }))
    : lines;
  return { ...toRequestView(decided, settled), outcome };
}
