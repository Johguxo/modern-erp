// Paso de reconfirmación (E4-H4, flujo §4): cuando una corrección sube el total por encima de la
// tolerancia, quienes ya firmaron los pasos posteriores al primero (almacén) reconfirman solo las
// líneas cambiadas. Puro: sin base de datos.
import type { StepRecord } from './approval-instance';
import type { PlannedStep } from './plan-instance';
import type { ActiveApprover } from './resolve-route';

export const RECONFIRMATION_STEP_NAME = 'Reconfirmación';

export interface PlanReconfirmationInput {
  /** Los pasos de la ronda vigente con sus asignados. */
  readonly steps: readonly StepRecord[];
  readonly members: readonly ActiveApprover[];
  /** Quien corrige y el solicitante nunca reconfirman. */
  readonly actorId: string;
  readonly requesterId: string;
  readonly lineIds: readonly string[];
}

/**
 * Quienes firmaron un paso posterior al primero que corrió, que siguen activos, pueden decidir y no
 * son quien corrige ni el solicitante. Sin ninguno: null (las firmas se mantienen).
 * El paso es de regla `any`, va al final (orden = máximo + 1) y queda `pending` si la ronda no
 * tiene otro paso pendiente; si lo tiene, `waiting`.
 */
export function planReconfirmation(input: PlanReconfirmationInput): PlannedStep | null {
  const ordered = [...input.steps].sort((a, b) => a.order - b.order);
  const first = ordered.find((step) => step.status !== 'skipped');
  if (!first) return null;

  const eligible = new Set(
    input.members
      .filter(
        (member) =>
          member.canDecide &&
          member.userId !== input.actorId &&
          member.userId !== input.requesterId,
      )
      .map((member) => member.userId),
  );
  const signers: string[] = [];
  for (const step of ordered) {
    if (step.order <= first.order || step.status !== 'approved') continue;
    for (const assignee of step.assignees) {
      const userId = assignee.userId;
      if (
        assignee.decision === 'approved' &&
        userId !== null &&
        eligible.has(userId) &&
        !signers.includes(userId)
      ) {
        signers.push(userId);
      }
    }
  }
  if (signers.length === 0) return null;

  const lastOrder = ordered.reduce((max, step) => Math.max(max, step.order), 0);
  const hasPending = ordered.some((step) => step.status === 'pending');
  return {
    order: lastOrder + 1,
    name: RECONFIRMATION_STEP_NAME,
    rule: 'any',
    status: hasPending ? 'waiting' : 'pending',
    assigneeIds: signers,
    kind: 'reconfirmation',
    lineIds: input.lineIds,
  };
}
