// Reglas de los pasos al guardar una política (E4-H1). Los límites de tamaño los valida el
// contrato Zod; aquí van las que dependen del negocio: al menos un paso, al menos un aprobador por
// paso y que los usuarios elegidos sean miembros activos del tenant (`approver_ref` no tiene FK).
import { ValidationError } from '@/shared/errors';

import type { PolicyStepSpec } from './policy';

/**
 * Valida los pasos y los devuelve normalizados: sin usuarios repetidos dentro de un paso (el
 * contrato ya los rechaza; esto es una defensa para quien llame sin pasar por él).
 */
export function validatePolicySteps(
  steps: readonly PolicyStepSpec[],
  activeMemberIds: ReadonlySet<string>,
): PolicyStepSpec[] {
  if (steps.length === 0) {
    throw new ValidationError({
      reason: 'policy_without_steps',
      message: 'A policy needs at least one step',
    });
  }

  const fieldErrors: Record<string, string[]> = {};
  let reason: 'step_without_approvers' | 'approver_not_member' | undefined;
  const fail = (path: string, code: 'step_without_approvers' | 'approver_not_member') => {
    (fieldErrors[path] ??= []).push(code);
    reason ??= code;
  };

  steps.forEach((step, index) => {
    if (step.approverType === 'role') {
      if (step.role === null) fail(`steps.${index}.role`, 'step_without_approvers');
      return;
    }
    if (step.userIds.length === 0) {
      fail(`steps.${index}.userIds`, 'step_without_approvers');
    } else if (step.userIds.some((userId) => !activeMemberIds.has(userId))) {
      fail(`steps.${index}.userIds`, 'approver_not_member');
    }
  });

  if (reason) {
    throw new ValidationError({
      reason,
      message: `Invalid policy steps: ${reason}`,
      fieldErrors,
    });
  }
  return steps.map((step) => ({ ...step, userIds: [...new Set(step.userIds)] }));
}
