import { describe, expect, it } from 'vitest';

import { updatePolicyStepsContract } from './index';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const usersStep = {
  name: 'Gerencia',
  approverType: 'users',
  role: null,
  userIds: [USER_A, USER_B],
  rule: 'any',
  condition: {},
};

describe('updatePolicyStepsContract', () => {
  const parse = (steps: unknown[]) =>
    updatePolicyStepsContract.inputSchema.safeParse({ docType: 'SOF', version: 1, steps });

  it('acepta un paso con usuarios distintos', () => {
    expect(parse([usersStep]).success).toBe(true);
  });

  it('rechaza un aprobador repetido dentro del paso', () => {
    const result = parse([usersStep, { ...usersStep, userIds: [USER_A, USER_A] }]);
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(['steps', 1, 'userIds']);
    expect(issue?.message).toBe('duplicated_approver');
  });
});
