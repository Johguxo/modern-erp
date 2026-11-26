// Decidir un paso de aprobación (E4-H2, flujo §3). Corre dentro de la transacción de requests, que ya
// bloqueó la solicitud. Orden de bloqueo: solicitud → última instancia (FOR UPDATE) → updates
// condicionales. Aplica `any`/`all`, avanza o cierra la ronda y escribe los eventos.
import type { Ctx } from '@/shared/context';
import { ConflictError, InvalidTransitionError, NotFoundError } from '@/shared/errors';

import type { DecisionKind, DecisionOutcome, StepRecord } from '../domain/approval-instance';
import { decideStep, outcomeAfter } from '../domain/decide-step';

import type { ApprovalEngineDeps } from './ports';

export interface DecideApprovalInput {
  readonly requestId: string;
  /** El paso que el usuario vio pendiente: si ya cambió, se rechaza (`step_already_decided`). */
  readonly stepId: string;
  readonly kind: DecisionKind;
  readonly comment: string | null;
}

export interface DecideApprovalOutput {
  readonly outcome: DecisionOutcome;
}

const EVENT_OF = {
  approve: 'step_approved',
  reject: 'step_rejected',
  request_changes: 'changes_requested',
} as const;

const alreadyDecided = (stepId: string, detail: string): ConflictError =>
  new ConflictError({
    reason: 'step_already_decided',
    message: `Step ${stepId} cannot be decided: ${detail}`,
  });

const userIdsOf = (step: StepRecord): string[] =>
  step.assignees.flatMap((assignee) => (assignee.userId ? [assignee.userId] : []));

export async function decideApproval(
  ctx: Ctx,
  input: DecideApprovalInput,
  deps: ApprovalEngineDeps,
): Promise<DecideApprovalOutput> {
  const { tenantId } = ctx;
  const instance = await deps.instances.lockLatest(tenantId, input.requestId);
  if (!instance) {
    // Documento «En aprobación» enviado antes del motor: no hay a quién preguntar.
    throw new ConflictError({
      reason: 'approval_not_started',
      message: `Request ${input.requestId} has no approval instance`,
    });
  }
  const step = await deps.instances.findStep(tenantId, input.stepId);
  if (!step || step.requestId !== input.requestId) {
    throw new NotFoundError({ message: 'Approval step not found' });
  }
  // Un paso de una ronda anterior ya se cerró: el documento siguió su camino.
  if (step.instanceId !== instance.id) throw alreadyDecided(step.id, 'older round');
  if (step.status === 'cancelled') {
    throw new InvalidTransitionError({ from: 'cancelled', event: input.kind });
  }

  const decision = decideStep(step, ctx.userId, input.kind);
  const now = deps.clock.now();

  const recorded = await deps.instances.recordAssigneeDecision(tenantId, {
    stepId: step.id,
    userId: ctx.userId,
    decision: decision.assigneeDecision,
    comment: input.comment,
    at: now,
  });
  if (!recorded) throw alreadyDecided(step.id, 'assignee already decided');

  if (decision.closesStep) {
    const closed = await deps.instances.closeStep(tenantId, step.id, {
      status: decision.stepStatus,
      decidedBy: ctx.userId,
      decidedAt: now,
      comment: input.comment,
    });
    if (!closed) throw alreadyDecided(step.id, 'step no longer pending');
  }

  const steps = await deps.instances.stepsOf(tenantId, instance.id);
  const next = steps.find(
    (candidate) => candidate.status === 'waiting' && candidate.order > step.order,
  );
  const outcome = outcomeAfter(decision, next !== undefined);

  await deps.events.append(tenantId, {
    requestId: input.requestId,
    instanceId: instance.id,
    stepId: step.id,
    type: EVENT_OF[input.kind],
    actorUserId: ctx.userId,
    comment: input.comment,
    data: {
      round: instance.round,
      stepOrder: step.order,
      stepName: step.name,
      rule: step.rule,
      stepClosed: decision.closesStep,
    },
  });

  switch (outcome) {
    case 'partial':
      break;
    case 'advanced': {
      if (!next) break;
      if (!(await deps.instances.activateStep(tenantId, next.id, now))) {
        throw alreadyDecided(next.id, 'next step is no longer waiting');
      }
      const assigneeIds = userIdsOf(next);
      if (assigneeIds.length === 0) {
        deps.logger.warn(
          { tenantId, requestId: input.requestId, stepId: next.id },
          'approval step has no assignees',
        );
      }
      await deps.events.append(tenantId, {
        requestId: input.requestId,
        instanceId: instance.id,
        stepId: next.id,
        type: 'step_pending',
        actorUserId: null,
        comment: null,
        data: {
          round: instance.round,
          stepOrder: next.order,
          stepName: next.name,
          assigneeIds,
          noAssignees: assigneeIds.length === 0,
        },
      });
      break;
    }
    case 'approved':
      await deps.instances.closeInstance(tenantId, instance.id, 'approved', now);
      await deps.events.append(tenantId, {
        requestId: input.requestId,
        instanceId: instance.id,
        stepId: null,
        type: 'approved',
        actorUserId: null,
        comment: null,
        data: { round: instance.round },
      });
      break;
    case 'rejected':
    case 'changes_requested':
      // Los pasos que seguían en espera ya no corren en esta ronda.
      await deps.instances.cancelOpenSteps(tenantId, instance.id, now);
      await deps.instances.closeInstance(tenantId, instance.id, outcome, now);
      break;
  }
  return { outcome };
}
