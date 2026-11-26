import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors';

import type { PolicyStepSpec } from './policy';
import { validatePolicySteps } from './validate-policy-steps';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const members = new Set([USER_A]);

const roleStep: PolicyStepSpec = {
  name: 'Almacén',
  approverType: 'role',
  role: 'warehouse',
  userIds: [],
  rule: 'any',
  condition: {},
};
const usersStep: PolicyStepSpec = {
  name: 'Gerencia',
  approverType: 'users',
  role: null,
  userIds: [USER_A],
  rule: 'all',
  condition: {},
};

function failure(steps: readonly PolicyStepSpec[]): ValidationError {
  try {
    validatePolicySteps(steps, members);
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error('Expected a ValidationError');
}

describe('validatePolicySteps', () => {
  it('acepta un paso por rol y un paso con miembros activos', () => {
    expect(() => validatePolicySteps([roleStep, usersStep], members)).not.toThrow();
  });

  it('sin pasos falla con policy_without_steps', () => {
    expect(failure([]).reason).toBe('policy_without_steps');
  });

  it('un paso por rol sin rol falla en su campo', () => {
    const error = failure([roleStep, { ...roleStep, role: null }]);
    expect(error.reason).toBe('step_without_approvers');
    expect(error.fieldErrors).toEqual({ 'steps.1.role': ['step_without_approvers'] });
  });

  it('un paso de usuarios vacío falla en su campo', () => {
    const error = failure([{ ...usersStep, userIds: [] }]);
    expect(error.fieldErrors).toEqual({ 'steps.0.userIds': ['step_without_approvers'] });
  });

  it('un usuario que no es miembro activo falla con approver_not_member', () => {
    const error = failure([{ ...usersStep, userIds: [USER_A, USER_B] }]);
    expect(error.reason).toBe('approver_not_member');
    expect(error.fieldErrors).toEqual({ 'steps.0.userIds': ['approver_not_member'] });
  });

  it('devuelve los pasos sin usuarios repetidos', () => {
    const result = validatePolicySteps([{ ...usersStep, userIds: [USER_A, USER_A] }], members);
    expect(result[0]?.userIds).toEqual([USER_A]);
  });
});
