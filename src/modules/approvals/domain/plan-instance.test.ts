import { describe, expect, it } from 'vitest';

import { planInstance, type PlanInput } from './plan-instance';
import type { PolicyStep } from './policy';
import type { ActiveApprover } from './resolve-route';

const REQUESTER = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const LUIS = '33333333-3333-4333-8333-333333333333';
const ROSA = '44444444-4444-4444-8444-444444444444';

const members: ActiveApprover[] = [
  { userId: ANA, name: 'Ana', roles: ['warehouse'] },
  { userId: LUIS, name: 'Luis', roles: ['approver'] },
  { userId: ROSA, name: 'Rosa', roles: ['approver', 'warehouse'] },
  { userId: REQUESTER, name: 'Solicitante', roles: ['approver'] },
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

function input(steps: PolicyStep[], overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    policy: { id: 'p1', name: 'SOF estándar', version: 3, hasReservedSteps: false, steps },
    requesterId: REQUESTER,
    total: '100.00',
    members,
    ...overrides,
  };
}

describe('planInstance', () => {
  it('deja el primer paso pendiente y los demás en espera', () => {
    const plan = planInstance(input([step(1), step(2, { role: 'approver' })]));
    expect(plan.steps.map((s) => [s.order, s.status])).toEqual([
      [1, 'pending'],
      [2, 'waiting'],
    ]);
    expect(plan.steps[0]?.assigneeIds).toEqual([ANA, ROSA]);
  });

  it('ordena los pasos por número aunque lleguen desordenados', () => {
    const plan = planInstance(input([step(2, { role: 'approver' }), step(1)]));
    expect(plan.steps.map((s) => s.order)).toEqual([1, 2]);
    expect(plan.steps[0]?.status).toBe('pending');
  });

  it('omite el paso cuya condición no se cumple y pone pendiente el siguiente', () => {
    const plan = planInstance(
      input([step(1, { condition: { min_amount: '5000.00' } }), step(2, { role: 'approver' })]),
    );
    expect(plan.steps.map((s) => s.status)).toEqual(['skipped', 'pending']);
    expect(plan.steps[0]?.assigneeIds).toEqual([]);
  });

  it('un paso con condición que sí se cumple aplica (límite inclusivo)', () => {
    const plan = planInstance(
      input([step(1, { condition: { min_amount: '100.00' } })], { total: '100.00' }),
    );
    expect(plan.steps[0]?.status).toBe('pending');
  });

  it('quita al solicitante de los asignados', () => {
    const plan = planInstance(input([step(1, { role: 'approver' })]));
    expect(plan.steps[0]?.assigneeIds).toEqual([LUIS, ROSA]);
  });

  it('con usuarios elegidos: respeta el orden, quita repetidos y desactivados', () => {
    const gone = '55555555-5555-4555-8555-555555555555';
    const plan = planInstance(
      input([
        step(1, {
          approverType: 'users',
          role: null,
          userIds: [LUIS, gone, LUIS, REQUESTER, ANA],
        }),
      ]),
    );
    expect(plan.steps[0]?.assigneeIds).toEqual([LUIS, ANA]);
  });

  it('un paso sin asignados (solo estaba el solicitante) queda pendiente con la lista vacía', () => {
    const plan = planInstance(
      input([step(1, { approverType: 'users', role: null, userIds: [REQUESTER] })]),
    );
    expect(plan.steps[0]).toMatchObject({ status: 'pending', assigneeIds: [] });
  });

  it('guarda una copia de la política con el total usado', () => {
    const plan = planInstance(input([step(1)], { total: '12.50' }));
    expect(plan.snapshot).toMatchObject({
      policyId: 'p1',
      name: 'SOF estándar',
      version: 3,
      total: '12.50',
      steps: [{ order: 1, name: 'Paso 1', role: 'warehouse', rule: 'any' }],
    });
  });

  it('falla con approval_route_empty si ningún paso aplica', () => {
    expect(() =>
      planInstance(input([step(1, { condition: { min_amount: '9999.00' } })])),
    ).toThrowError(expect.objectContaining({ code: 'CONFLICT', reason: 'approval_route_empty' }));
  });

  it('falla con approval_route_empty si la política no tiene pasos', () => {
    expect(() => planInstance(input([]))).toThrowError(
      expect.objectContaining({ reason: 'approval_route_empty' }),
    );
  });

  it('falla con approval_policy_unsupported si la política tiene pasos reservados', () => {
    const base = input([step(1)]);
    expect(() =>
      planInstance({ ...base, policy: { ...base.policy, hasReservedSteps: true } }),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', reason: 'approval_policy_unsupported' }),
    );
  });
});
