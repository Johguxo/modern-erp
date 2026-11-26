import { describe, expect, it } from 'vitest';

import type { Policy, PolicyStep } from './policy';
import { resolveRoute, stepWarnings, type ActiveApprover } from './resolve-route';

const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';

const members: ActiveApprover[] = [
  { userId: ANA, name: 'Ana Pérez', roles: ['warehouse'] },
  { userId: LUIS, name: 'Luis Rojas', roles: ['approver', 'requester'] },
];

function step(order: number, overrides: Partial<PolicyStep> = {}): PolicyStep {
  return {
    order,
    name: `Paso ${order}`,
    approverType: 'role',
    role: 'warehouse',
    userIds: [],
    rule: 'any',
    condition: {},
    ...overrides,
  };
}

function policy(steps: PolicyStep[]): Policy {
  return {
    id: 'p1',
    docType: 'SOF',
    name: 'SOF estándar',
    version: 1,
    hasReservedSteps: false,
    steps,
  };
}

describe('resolveRoute', () => {
  it('resuelve los aprobadores de un rol con los miembros activos que lo tienen', () => {
    const route = resolveRoute('SOF', policy([step(1)]), '10.00', members);
    expect(route.steps[0]).toMatchObject({
      approverType: 'role',
      role: 'warehouse',
      approvers: [{ userId: ANA, name: 'Ana Pérez' }],
    });
  });

  it('resuelve los usuarios elegidos en su orden y omite a los desactivados', () => {
    const route = resolveRoute(
      'SOF',
      policy([step(1, { approverType: 'users', role: null, userIds: [LUIS, GONE, ANA] })]),
      null,
      members,
    );
    expect(route.steps[0]?.approvers.map((a) => a.userId)).toEqual([LUIS, ANA]);
  });

  it('ordena por número y omite los pasos cuya condición no se cumple', () => {
    const route = resolveRoute(
      'SOF',
      policy([
        step(3, { name: 'Hong Kong', condition: { min_amount: '5000.00' } }),
        step(1),
        step(2, { role: 'approver' }),
      ]),
      '4999.99',
      members,
    );
    expect(route.policyName).toBe('SOF estándar');
    expect(route.steps.map((s) => s.order)).toEqual([1, 2]);
  });

  it('aplica el paso con monto mínimo cuando el total lo alcanza', () => {
    const route = resolveRoute(
      'SOF',
      policy([step(1), step(2, { condition: { min_amount: '5000.00' } })]),
      '5000.00',
      members,
    );
    expect(route.steps.map((s) => s.order)).toEqual([1, 2]);
  });

  it('un rol sin miembros deja el paso sin aprobadores', () => {
    const route = resolveRoute('SOF', policy([step(1, { role: 'purchasing' })]), null, members);
    expect(route.steps[0]?.approvers).toEqual([]);
  });
});

describe('stepWarnings', () => {
  it('avisa si el rol no tiene miembros activos', () => {
    expect(stepWarnings(step(1, { role: 'purchasing' }), members)).toEqual([
      { type: 'role_without_members' },
    ]);
    expect(stepWarnings(step(1), members)).toEqual([]);
  });

  it('avisa de los usuarios desactivados de un paso de usuarios', () => {
    expect(
      stepWarnings(step(1, { approverType: 'users', role: null, userIds: [ANA, GONE] }), members),
    ).toEqual([{ type: 'inactive_users', userIds: [GONE] }]);
  });
});
