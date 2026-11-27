// E4-H4 · Quién reconfirma y cómo queda el paso (puro).
import { describe, expect, it } from 'vitest';

import type { AssigneeDecision, StepRecord, StepStatus } from './approval-instance';
import { planReconfirmation, type PlanReconfirmationInput } from './plan-reconfirmation';
import type { ActiveApprover } from './resolve-route';

const REQUESTER = 'u-req';
const ACTOR = 'u-actor';
const ANA = 'u-ana';
const LUIS = 'u-luis';
const ROSA = 'u-rosa';
const OFF = 'u-off';

const members: ActiveApprover[] = [
  { userId: REQUESTER, name: 'Solicitante', roles: ['requester'], canDecide: true },
  { userId: ACTOR, name: 'Almacén', roles: ['warehouse'], canDecide: true },
  { userId: ANA, name: 'Ana', roles: ['warehouse'], canDecide: true },
  { userId: LUIS, name: 'Luis', roles: ['approver'], canDecide: true },
  { userId: ROSA, name: 'Rosa', roles: ['approver'], canDecide: true },
  { userId: OFF, name: 'Sin permiso', roles: ['requester'], canDecide: false },
];

const step = (
  order: number,
  status: StepStatus,
  signed: Record<string, AssigneeDecision | null>,
): StepRecord => ({
  id: `s${order}`,
  instanceId: 'i1',
  order,
  name: `Paso ${order}`,
  rule: 'any',
  status,
  assignees: Object.entries(signed).map(([userId, decision], n) => ({
    id: `a${order}-${n}`,
    userId,
    decision,
  })),
});

const LINES = ['line-1'];

const plan = (steps: StepRecord[], overrides: Partial<PlanReconfirmationInput> = {}) =>
  planReconfirmation({
    steps,
    members,
    actorId: ACTOR,
    requesterId: REQUESTER,
    lineIds: LINES,
    ...overrides,
  });

describe('planReconfirmation', () => {
  it('SOF aprobado: reconfirman quienes firmaron después de almacén; el paso queda pendiente al final', () => {
    const planned = plan([
      step(1, 'approved', { [ANA]: 'approved', [ACTOR]: null }),
      step(2, 'approved', { [LUIS]: 'approved', [ROSA]: null }),
    ]);
    expect(planned).toEqual({
      order: 3,
      name: 'Reconfirmación',
      rule: 'any',
      status: 'pending',
      assigneeIds: [LUIS],
      kind: 'reconfirmation',
      lineIds: LINES,
    });
  });

  it('en aprobación con otro paso pendiente: el paso espera (waiting)', () => {
    const planned = plan([
      step(1, 'approved', { [ANA]: 'approved' }),
      step(2, 'approved', { [LUIS]: 'approved' }),
      step(3, 'pending', { [ROSA]: null }),
    ]);
    expect(planned).toMatchObject({ order: 4, status: 'waiting', assigneeIds: [LUIS] });
  });

  it('solo con almacén firmado: no hay a quién pedir y no hay paso', () => {
    expect(
      plan([step(1, 'approved', { [ANA]: 'approved' }), step(2, 'pending', { [LUIS]: null })]),
    ).toBeNull();
  });

  it('no incluye a quien corrige ni al solicitante, aunque hayan firmado', () => {
    expect(
      plan([
        step(1, 'approved', { [ANA]: 'approved' }),
        step(2, 'approved', { [ACTOR]: 'approved' }),
        step(3, 'approved', { [REQUESTER]: 'approved' }),
      ]),
    ).toBeNull();
  });

  it('solo miembros activos con approvals.decide, sin repetidos', () => {
    const planned = plan([
      step(1, 'approved', { [ANA]: 'approved' }),
      step(2, 'approved', { [LUIS]: 'approved', [OFF]: 'approved', ['u-gone']: 'approved' }),
      step(3, 'approved', { [LUIS]: 'approved', [ROSA]: 'approved' }),
    ]);
    expect(planned?.assigneeIds).toEqual([LUIS, ROSA]);
  });

  it('una segunda reconfirmación va en secuencia: su orden es el máximo + 1', () => {
    const planned = plan([
      step(1, 'approved', { [ANA]: 'approved' }),
      step(2, 'approved', { [LUIS]: 'approved' }),
      step(3, 'approved', { [ROSA]: 'approved' }),
    ]);
    expect(planned).toMatchObject({ order: 4, assigneeIds: [LUIS, ROSA] });
  });

  it('si el primer paso se omitió, «el primero» es el primero que corrió', () => {
    const planned = plan([
      { ...step(1, 'skipped', {}) },
      step(2, 'approved', { [ANA]: 'approved' }),
      step(3, 'approved', { [LUIS]: 'approved' }),
    ]);
    expect(planned?.assigneeIds).toEqual([LUIS]);
  });
});
