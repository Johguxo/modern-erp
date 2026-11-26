// Plan de una instancia de aprobación (E4-H2, flujo §3): a partir de la política, el total y los
// miembros activos decide qué pasos corren, quién los aprueba y cuál queda pendiente primero.
// Puro y sin base de datos.
import { ConflictError } from '@/shared/errors';

import type { PolicySnapshot } from './approval-instance';
import type { Policy } from './policy';
import { stepApprovers, type ActiveApprover } from './resolve-route';
import type { StepRule } from './route-preview';
import { stepApplies } from './step-condition';

export interface PlannedStep {
  readonly order: number;
  readonly name: string;
  readonly rule: StepRule;
  /** `pending` el primero que aplica, `waiting` los siguientes y `skipped` los que no aplican. */
  readonly status: 'pending' | 'waiting' | 'skipped';
  /** Usuarios que pueden decidir, sin el solicitante y sin repetidos; vacío si el paso se omite. */
  readonly assigneeIds: readonly string[];
  /** `normal` si se omite (la copia de la política); `reconfirmation` lo agrega una corrección. */
  readonly kind?: 'normal' | 'reconfirmation';
  /** Solo en `reconfirmation`: las líneas que se reconfirman (E4-H4). */
  readonly lineIds?: readonly string[];
}

export interface PlannedInstance {
  readonly snapshot: PolicySnapshot;
  readonly steps: readonly PlannedStep[];
}

export interface PlanInput {
  readonly policy: Pick<Policy, 'id' | 'name' | 'version' | 'steps' | 'hasReservedSteps'>;
  readonly requesterId: string;
  /** Total del documento (texto decimal) con el que se evalúan las condiciones. */
  readonly total: string | null;
  readonly members: readonly ActiveApprover[];
}

/** Los aprobadores del paso: nadie aprueba su propia solicitud (§3) y cada usuario cuenta una vez. */
export function assigneesOf(
  step: Parameters<typeof stepApprovers>[0],
  members: readonly ActiveApprover[],
  requesterId: string,
): string[] {
  const ids = stepApprovers(step, members)
    .map((approver) => approver.userId)
    .filter((userId) => userId !== requesterId);
  return [...new Set(ids)];
}

/**
 * ConflictError `approval_policy_unsupported` si la política tiene pasos que el MVP no entiende y
 * `approval_route_empty` si ningún paso aplica a este total.
 */
export function planInstance(input: PlanInput): PlannedInstance {
  const { policy, requesterId, total, members } = input;
  if (policy.hasReservedSteps) {
    throw new ConflictError({
      reason: 'approval_policy_unsupported',
      message: `Approval policy ${policy.id} has steps this version cannot run`,
    });
  }
  const ordered = [...policy.steps].sort((a, b) => a.order - b.order);
  let pendingAssigned = false;
  const steps = ordered.map((step): PlannedStep => {
    if (!stepApplies(step.condition, total)) {
      return {
        order: step.order,
        name: step.name,
        rule: step.rule,
        status: 'skipped',
        assigneeIds: [],
      };
    }
    const status = pendingAssigned ? 'waiting' : 'pending';
    pendingAssigned = true;
    return {
      order: step.order,
      name: step.name,
      rule: step.rule,
      status,
      assigneeIds: assigneesOf(step, members, requesterId),
    };
  });
  if (!pendingAssigned) {
    throw new ConflictError({
      reason: 'approval_route_empty',
      message: `No step of policy ${policy.id} applies to total ${total ?? 'null'}`,
    });
  }
  return {
    snapshot: {
      policyId: policy.id,
      name: policy.name,
      version: policy.version,
      total,
      steps: ordered.map((step) => ({
        order: step.order,
        name: step.name,
        approverType: step.approverType,
        role: step.role,
        userIds: step.userIds,
        rule: step.rule,
        condition: step.condition,
      })),
    },
    steps,
  };
}
