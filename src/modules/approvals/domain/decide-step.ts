// Decisión de un aprobador sobre su paso (E4-H2, flujo §3). Puro: valida que pueda decidir y dice
// cómo queda el paso; el motor (application/) lo guarda y avanza la ronda.
import { ConflictError, ForbiddenError } from '@/shared/errors';

import type {
  AssigneeDecision,
  AssigneeRecord,
  DecisionKind,
  DecisionOutcome,
  StepRecord,
  StepStatus,
} from './approval-instance';

export interface StepDecision {
  /** Lo que queda registrado para el aprobador. */
  readonly assigneeDecision: AssigneeDecision;
  /** Estado del paso después de decidir (sigue `pending` si faltan aprobadores de la regla `all`). */
  readonly stepStatus: StepStatus;
  readonly closesStep: boolean;
}

const DECISION_OF: Readonly<Record<DecisionKind, AssigneeDecision>> = {
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'changes_requested',
};

/**
 * - ConflictError `step_already_decided` si el paso ya no está pendiente o este usuario ya decidió.
 * - ForbiddenError `not_an_approver` si el usuario no es asignado del paso.
 * Con la regla `any` la primera aprobación cierra el paso; con `all` cierra cuando aprueban todos.
 * Rechazar o pedir cambios cierra el paso con cualquier regla.
 */
export function decideStep(
  step: Pick<StepRecord, 'id' | 'status' | 'rule' | 'assignees'>,
  actorId: string,
  kind: DecisionKind,
): StepDecision {
  if (step.status !== 'pending') {
    throw new ConflictError({
      reason: 'step_already_decided',
      message: `Step ${step.id} is ${step.status}, not pending`,
    });
  }
  const own: AssigneeRecord | undefined = step.assignees.find(
    (assignee) => assignee.userId === actorId,
  );
  if (!own) {
    throw new ForbiddenError({
      reason: 'not_an_approver',
      message: `User ${actorId} is not an approver of step ${step.id}`,
    });
  }
  if (own.decision !== null) {
    throw new ConflictError({
      reason: 'step_already_decided',
      message: `User ${actorId} already decided step ${step.id}`,
    });
  }
  const assigneeDecision = DECISION_OF[kind];
  if (assigneeDecision !== 'approved') {
    return { assigneeDecision, stepStatus: assigneeDecision, closesStep: true };
  }
  const othersPending = step.assignees.some(
    (assignee) => assignee !== own && assignee.decision !== 'approved',
  );
  const closes = step.rule === 'any' || !othersPending;
  return {
    assigneeDecision,
    stepStatus: closes ? 'approved' : 'pending',
    closesStep: closes,
  };
}

/**
 * Efecto en la ronda de una decisión sobre el paso: la aprobación que no cierra el paso es
 * `partial`; si cierra, `advanced` cuando hay un paso siguiente y `approved` si era el último.
 */
export function outcomeAfter(decision: StepDecision, hasNextStep: boolean): DecisionOutcome {
  if (decision.stepStatus === 'rejected') return 'rejected';
  if (decision.stepStatus === 'changes_requested') return 'changes_requested';
  if (!decision.closesStep) return 'partial';
  return hasNextStep ? 'advanced' : 'approved';
}
