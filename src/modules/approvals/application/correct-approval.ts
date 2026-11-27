// Corrección de una línea desde el motor de aprobaciones (E4-H4, flujo §4). Corre dentro de la
// transacción de requests, que ya bloqueó la solicitud: primero `readTolerance` (bloquea la última
// instancia, siempre después de la solicitud) y, con la regla de reaprobación ya resuelta por
// requests, `recordCorrection` escribe el evento `line_corrected` y, si el total subió por encima
// de la tolerancia, el paso de reconfirmación (reabriendo la ronda si estaba aprobada).
import type { Ctx } from '@/shared/context';
import { ConflictError } from '@/shared/errors';

import type { InstanceRecord, StepRecord } from '../domain/approval-instance';
import type { PlannedStep } from '../domain/plan-instance';
import { planReconfirmation } from '../domain/plan-reconfirmation';
import { reapprovalToleranceOf } from '../domain/policy-settings';

import type { ApprovalEngineDeps } from './ports';

const notStarted = (requestId: string): ConflictError =>
  new ConflictError({
    reason: 'approval_not_started',
    message: `Request ${requestId} has no approval instance`,
  });

async function lockInstance(
  ctx: Ctx,
  requestId: string,
  deps: ApprovalEngineDeps,
): Promise<InstanceRecord> {
  const instance = await deps.instances.lockLatest(ctx.tenantId, requestId);
  // Solo una ronda en curso o aprobada se corrige; sin instancia el motor no tiene a quién avisar.
  if (!instance || (instance.status !== 'in_progress' && instance.status !== 'approved')) {
    throw notStarted(requestId);
  }
  return instance;
}

export async function readTolerance(
  ctx: Ctx,
  input: { readonly requestId: string },
  deps: ApprovalEngineDeps,
): Promise<{ readonly tolerancePct: string }> {
  const instance = await lockInstance(ctx, input.requestId, deps);
  const settings = await deps.instances.settingsOf(ctx.tenantId, instance.id);
  const tolerance = reapprovalToleranceOf(settings);
  if (tolerance.fallback !== null) {
    deps.logger[tolerance.fallback === 'invalid' ? 'warn' : 'info'](
      { tenantId: ctx.tenantId, requestId: input.requestId, fallback: tolerance.fallback },
      'reapproval tolerance not configured: using 0',
    );
  }
  return { tolerancePct: tolerance.tolerancePct };
}

export interface RecordCorrectionInput {
  readonly requestId: string;
  readonly requesterId: string;
  readonly lineId: string;
  readonly lineNo: number;
  readonly changeType: 'update' | 'add' | 'remove';
  readonly reason: string;
  /** La línea antes y después (null al agregar y al quitar); va tal cual al evento. */
  readonly before: object | null;
  readonly after: object | null;
  readonly changedFields: readonly string[];
  readonly branch: 'amount_unchanged' | 'within_tolerance' | 'above_tolerance';
  readonly previousTotal: string;
  readonly newTotal: string;
  readonly tolerancePct: string;
}

export interface RecordCorrectionOutput {
  /** Se creó un paso de reconfirmación (y, si estaba aprobada, la ronda volvió a `in_progress`). */
  readonly reconfirmation: boolean;
}

export async function recordCorrection(
  ctx: Ctx,
  input: RecordCorrectionInput,
  deps: ApprovalEngineDeps,
): Promise<RecordCorrectionOutput> {
  const { tenantId } = ctx;
  const instance = await lockInstance(ctx, input.requestId, deps);
  const steps = await deps.instances.stepsOf(tenantId, instance.id);
  const now = deps.clock.now();

  // Avisos informativos (E5): el solicitante y quienes ya firmaron esta ronda, sin quien corrige.
  const signerIds = steps.flatMap((step) =>
    step.assignees.flatMap((a) => (a.decision === 'approved' && a.userId ? [a.userId] : [])),
  );
  const notifyUserIds = [...new Set([input.requesterId, ...signerIds])].filter(
    (userId) => userId !== ctx.userId,
  );

  let reconfirmationStep: { created: StepRecord; planned: PlannedStep } | null = null;
  if (input.branch === 'above_tolerance') {
    const members = await deps.directory.activeMembers(tenantId);
    const planned = planReconfirmation({
      steps,
      members,
      actorId: ctx.userId,
      requesterId: input.requesterId,
      lineIds: [input.lineId],
    });
    if (planned) {
      if (instance.status === 'approved') {
        if (!(await deps.instances.reopenInstance(tenantId, instance.id, now))) {
          throw new ConflictError({
            reason: 'stale_version',
            message: `Approval instance ${instance.id} is no longer approved`,
          });
        }
      }
      const [created] = await deps.instances.insertSteps(tenantId, instance, [planned], now);
      reconfirmationStep = created ? { created, planned } : null;
    }
  }

  await deps.events.append(tenantId, {
    requestId: input.requestId,
    instanceId: instance.id,
    stepId: null,
    type: 'line_corrected',
    actorUserId: ctx.userId,
    comment: input.reason,
    data: {
      round: instance.round,
      lineId: input.lineId,
      lineNo: input.lineNo,
      changeType: input.changeType,
      changedFields: [...input.changedFields],
      before: input.before,
      after: input.after,
      branch: input.branch,
      previousTotal: input.previousTotal,
      newTotal: input.newTotal,
      tolerancePct: input.tolerancePct,
      reconfirmation: reconfirmationStep !== null,
      notifyUserIds,
    },
  });

  if (input.branch === 'above_tolerance' && !reconfirmationStep) {
    // §4: sin nadie a quien pedírselo, las firmas se mantienen; queda en el evento y en el log.
    deps.logger.warn(
      { tenantId, requestId: input.requestId, lineId: input.lineId },
      'reconfirmation needed but no earlier approver can reconfirm: signatures kept',
    );
    return { reconfirmation: false };
  }
  if (!reconfirmationStep) return { reconfirmation: false };

  const { created, planned } = reconfirmationStep;
  await deps.events.append(tenantId, {
    requestId: input.requestId,
    instanceId: instance.id,
    stepId: created.id,
    type: 'reconfirmation_requested',
    actorUserId: ctx.userId,
    comment: input.reason,
    data: {
      round: instance.round,
      stepOrder: created.order,
      stepName: created.name,
      lineIds: [input.lineId],
      lineNos: [input.lineNo],
      assigneeIds: [...planned.assigneeIds],
    },
  });
  if (created.status === 'pending') {
    await deps.events.append(tenantId, {
      requestId: input.requestId,
      instanceId: instance.id,
      stepId: created.id,
      type: 'step_pending',
      actorUserId: null,
      comment: null,
      data: {
        round: instance.round,
        stepOrder: created.order,
        stepName: created.name,
        assigneeIds: [...planned.assigneeIds],
        noAssignees: false,
      },
    });
  }
  return { reconfirmation: true };
}
