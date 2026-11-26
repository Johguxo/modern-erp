import { describe, expect, it } from 'vitest';

import type { StepRecord } from './approval-instance';
import { decideStep, outcomeAfter } from './decide-step';

const ANA = '22222222-2222-4222-8222-222222222222';
const LUIS = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';

function step(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    id: 's1',
    instanceId: 'i1',
    order: 1,
    name: 'Almacén',
    rule: 'any',
    status: 'pending',
    assignees: [
      { id: 'a1', userId: ANA, decision: null },
      { id: 'a2', userId: LUIS, decision: null },
    ],
    ...overrides,
  };
}

describe('decideStep', () => {
  it('any: la primera aprobación cierra el paso', () => {
    expect(decideStep(step(), ANA, 'approve')).toEqual({
      assigneeDecision: 'approved',
      stepStatus: 'approved',
      closesStep: true,
    });
  });

  it('all: aprobar sin que aprueben todos deja el paso pendiente', () => {
    expect(decideStep(step({ rule: 'all' }), ANA, 'approve')).toEqual({
      assigneeDecision: 'approved',
      stepStatus: 'pending',
      closesStep: false,
    });
  });

  it('all: el último en aprobar cierra el paso', () => {
    const almost = step({
      rule: 'all',
      assignees: [
        { id: 'a1', userId: ANA, decision: 'approved' },
        { id: 'a2', userId: LUIS, decision: null },
      ],
    });
    expect(decideStep(almost, LUIS, 'approve')).toMatchObject({
      stepStatus: 'approved',
      closesStep: true,
    });
  });

  it.each(['any', 'all'] as const)('%s: rechazar cierra el paso como rejected', (rule) => {
    expect(decideStep(step({ rule }), ANA, 'reject')).toEqual({
      assigneeDecision: 'rejected',
      stepStatus: 'rejected',
      closesStep: true,
    });
  });

  it.each(['any', 'all'] as const)('%s: pedir cambios cierra el paso', (rule) => {
    expect(decideStep(step({ rule }), LUIS, 'request_changes')).toEqual({
      assigneeDecision: 'changes_requested',
      stepStatus: 'changes_requested',
      closesStep: true,
    });
  });

  it('quien no es asignado recibe not_an_approver', () => {
    expect(() => decideStep(step(), OUTSIDER, 'approve')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN', reason: 'not_an_approver' }),
    );
  });

  it.each([
    'approved',
    'rejected',
    'changes_requested',
    'cancelled',
    'waiting',
    'skipped',
  ] as const)('un paso %s ya no se decide: step_already_decided', (status) => {
    expect(() => decideStep(step({ status }), ANA, 'approve')).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', reason: 'step_already_decided' }),
    );
  });

  it('all: quien ya aprobó no puede decidir de nuevo', () => {
    const decided = step({
      rule: 'all',
      assignees: [
        { id: 'a1', userId: ANA, decision: 'approved' },
        { id: 'a2', userId: LUIS, decision: null },
      ],
    });
    expect(() => decideStep(decided, ANA, 'approve')).toThrowError(
      expect.objectContaining({ reason: 'step_already_decided' }),
    );
  });
});

describe('outcomeAfter', () => {
  const close = { assigneeDecision: 'approved', stepStatus: 'approved', closesStep: true } as const;

  it('aprobación que cierra: advanced con paso siguiente, approved sin él', () => {
    expect(outcomeAfter(close, true)).toBe('advanced');
    expect(outcomeAfter(close, false)).toBe('approved');
  });

  it('aprobación parcial de la regla all', () => {
    expect(
      outcomeAfter(
        { assigneeDecision: 'approved', stepStatus: 'pending', closesStep: false },
        true,
      ),
    ).toBe('partial');
  });

  it('rechazo y cambios pedidos cierran la ronda aunque haya pasos siguientes', () => {
    expect(
      outcomeAfter(
        { assigneeDecision: 'rejected', stepStatus: 'rejected', closesStep: true },
        true,
      ),
    ).toBe('rejected');
    expect(
      outcomeAfter(
        {
          assigneeDecision: 'changes_requested',
          stepStatus: 'changes_requested',
          closesStep: true,
        },
        true,
      ),
    ).toBe('changes_requested');
  });
});
