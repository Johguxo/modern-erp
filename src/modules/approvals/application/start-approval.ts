// Arrancar la aprobación de un documento enviado o reenviado (E4-H2, flujo §3). Corre dentro de la
// transacción del envío (requests ya bloqueó la solicitud): bloquea la última instancia, copia la
// política (FOR SHARE), arma los pasos y los asignados y escribe los eventos. Si lanza, el envío
// completo se revierte.
import type { Ctx } from '@/shared/context';
import { ConflictError } from '@/shared/errors';

import { planInstance } from '../domain/plan-instance';
import type { DocType } from '../domain/route-preview';

import type { ApprovalEngineDeps } from './ports';

export interface StartApprovalInput {
  readonly requestId: string;
  readonly docType: DocType;
  /** Total del documento (texto decimal): decide qué pasos aplican. */
  readonly totalAmount: string;
  readonly requesterId: string;
}

export async function startApproval(
  ctx: Ctx,
  input: StartApprovalInput,
  deps: ApprovalEngineDeps,
): Promise<{ readonly round: number }> {
  const { tenantId } = ctx;
  const latest = await deps.instances.lockLatest(tenantId, input.requestId);
  // Solo se reenvía una ronda cerrada con cambios pedidos; cualquier otra ya corrió.
  if (latest !== null && latest.status !== 'changes_requested') {
    throw new ConflictError({
      reason: 'approval_already_started',
      message: `Request ${input.requestId} already has an approval in ${latest.status}`,
    });
  }

  const policy = await deps.policies.findActiveForStart(tenantId, input.docType);
  if (!policy) {
    throw new ConflictError({
      reason: 'approval_policy_missing',
      message: `Tenant ${tenantId} has no active ${input.docType} approval policy`,
    });
  }
  const members = await deps.directory.activeMembers(tenantId);
  const plan = planInstance({
    policy,
    requesterId: input.requesterId,
    total: input.totalAmount,
    members,
  });

  const round = (latest?.round ?? 0) + 1;
  const instance = await deps.instances.create(tenantId, {
    requestId: input.requestId,
    round,
    policyId: policy.id,
    snapshot: plan.snapshot,
  });
  const steps = await deps.instances.insertSteps(tenantId, instance, plan.steps, deps.clock.now());

  await deps.events.append(tenantId, {
    requestId: input.requestId,
    instanceId: instance.id,
    stepId: null,
    type: round === 1 ? 'submitted' : 'resubmitted',
    actorUserId: ctx.userId,
    comment: null,
    data: { round, policyId: policy.id, policyName: policy.name, policyVersion: policy.version },
  });

  const pending = steps.find((step) => step.status === 'pending');
  if (pending) {
    const assigneeIds = pending.assignees.flatMap((a) => (a.userId ? [a.userId] : []));
    if (assigneeIds.length === 0) {
      // §3: el paso queda pendiente sin asignados; el aviso al admin llega con E5.
      deps.logger.warn(
        { tenantId, requestId: input.requestId, stepId: pending.id },
        'approval step has no assignees',
      );
    }
    await deps.events.append(tenantId, {
      requestId: input.requestId,
      instanceId: instance.id,
      stepId: pending.id,
      type: 'step_pending',
      actorUserId: null,
      comment: null,
      data: {
        round,
        stepOrder: pending.order,
        stepName: pending.name,
        assigneeIds,
        noAssignees: assigneeIds.length === 0,
      },
    });
  }
  return { round };
}
