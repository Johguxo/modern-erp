import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { InMemoryApprovals } from '@tests/support/fakes/in-memory-approvals';
import { describe, expect, it } from 'vitest';

import type { Ctx } from '@/shared/context';

import type { Policy, PolicyStep } from '../domain/policy';

import { cancelApproval } from './cancel-approval';
import { decideApproval } from './decide-approval-step';
import type { ApprovalEngineDeps, DirectoryMember } from './ports';
import { startApproval } from './start-approval';

const TENANT = '11111111-1111-4111-8111-111111111111';
const REQUESTER = '22222222-2222-4222-8222-222222222222';
const ANA = '33333333-3333-4333-8333-333333333333';
const ROSA = '44444444-4444-4444-8444-444444444444';
const LUIS = '55555555-5555-4555-8555-555555555555';
const REQUEST = '66666666-6666-4666-8666-666666666666';

const members: DirectoryMember[] = [
  { userId: REQUESTER, name: 'Solicitante', roles: ['requester'], canDecide: false },
  { userId: ANA, name: 'Ana', roles: ['warehouse'], canDecide: true },
  { userId: ROSA, name: 'Rosa', roles: ['warehouse'], canDecide: true },
  { userId: LUIS, name: 'Luis', roles: ['approver'], canDecide: true },
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

function setup(steps: PolicyStep[] = [step(1), step(2, { role: 'approver' })]) {
  const store = new InMemoryApprovals();
  const logger = new CapturingLogger();
  let policy: Policy | null = {
    id: 'pol-1',
    docType: 'SOF',
    name: 'SOF estándar',
    version: 2,
    hasReservedSteps: false,
    steps,
  };
  const deps: ApprovalEngineDeps = {
    policies: { findActiveForStart: () => Promise.resolve(policy) },
    directory: { activeMembers: () => Promise.resolve(members) },
    instances: store,
    events: store,
    clock: new FixedClock(),
    logger,
  };
  return { store, logger, deps, setPolicy: (next: Policy | null) => (policy = next) };
}

const as = (userId: string): Ctx => makeCtx({ tenantId: TENANT, userId });

const start = (deps: ApprovalEngineDeps, requesterId = REQUESTER) =>
  startApproval(
    as(requesterId),
    { requestId: REQUEST, docType: 'SOF', totalAmount: '100.00', requesterId },
    deps,
  );

const decide = (
  deps: ApprovalEngineDeps,
  userId: string,
  stepId: string,
  kind: 'approve' | 'reject' | 'request_changes' = 'approve',
  comment: string | null = null,
) => decideApproval(as(userId), { requestId: REQUEST, stepId, kind, comment }, deps);

describe('startApproval', () => {
  it('crea la ronda 1 con el primer paso pendiente, los asignados y los eventos', async () => {
    const { store, deps } = setup();
    await expect(start(deps)).resolves.toEqual({ round: 1 });

    expect(store.instances).toHaveLength(1);
    expect(store.instances[0]).toMatchObject({
      round: 1,
      status: 'in_progress',
      policyId: 'pol-1',
    });
    expect(store.steps.map((s) => [s.order, s.status])).toEqual([
      [1, 'pending'],
      [2, 'waiting'],
    ]);
    expect(store.steps[0]?.assignees.map((a) => a.userId)).toEqual([ANA, ROSA]);
    expect(store.events.map((e) => e.type)).toEqual(['submitted', 'step_pending']);
    expect(store.events[0]).toMatchObject({
      actorUserId: REQUESTER,
      data: { round: 1, policyId: 'pol-1', policyName: 'SOF estándar', policyVersion: 2 },
    });
    expect(store.events[1]).toMatchObject({
      actorUserId: null,
      data: { assigneeIds: [ANA, ROSA], noAssignees: false },
    });
  });

  it('el solicitante no queda asignado a su propia solicitud', async () => {
    const { store, deps } = setup([step(1), step(2, { role: 'approver' })]);
    await start(deps, ANA); // Ana tiene el rol de almacén pero es quien pide.
    expect(store.steps[0]?.assignees.map((a) => a.userId)).toEqual([ROSA]);
    expect(store.steps[1]?.assignees.map((a) => a.userId)).toEqual([LUIS]);
  });

  it('un paso sin asignados queda pendiente, con aviso y noAssignees en el evento', async () => {
    const { store, logger, deps } = setup([step(1, { role: 'purchasing' })]);
    await start(deps);
    expect(store.steps[0]).toMatchObject({ status: 'pending', assignees: [] });
    expect(store.events[1]?.data).toMatchObject({ noAssignees: true, assigneeIds: [] });
    expect(logger.find('approval step has no assignees')?.level).toBe('warn');
  });

  it('sin política activa: approval_policy_missing y no crea nada', async () => {
    const { store, deps, setPolicy } = setup();
    setPolicy(null);
    await expect(start(deps)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'approval_policy_missing',
    });
    expect(store.instances).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('con una ronda en curso no arranca otra (approval_already_started)', async () => {
    const { deps } = setup();
    await start(deps);
    await expect(start(deps)).rejects.toMatchObject({ reason: 'approval_already_started' });
  });

  it('tras pedir cambios, el reenvío abre la ronda 2 con el evento resubmitted', async () => {
    const { store, deps } = setup();
    await start(deps);
    const stepId = store.steps[0]?.id ?? '';
    await decide(deps, ANA, stepId, 'request_changes', 'Falta el centro de costo');

    await expect(start(deps)).resolves.toEqual({ round: 2 });
    expect(store.instances.map((i) => [i.round, i.status])).toEqual([
      [1, 'changes_requested'],
      [2, 'in_progress'],
    ]);
    expect(store.events.at(-2)).toMatchObject({ type: 'resubmitted', data: { round: 2 } });
    // Los eventos de la ronda 1 siguen ahí.
    expect(
      store.events.filter((e) => e.instanceId === store.instances[0]?.id).length,
    ).toBeGreaterThan(2);
  });
});

describe('decideApproval', () => {
  it('any: la primera aprobación cierra el paso y deja pendiente el siguiente', async () => {
    const { store, deps } = setup();
    await start(deps);
    const stepId = store.steps[0]?.id ?? '';

    await expect(decide(deps, ANA, stepId)).resolves.toEqual({ outcome: 'advanced' });

    expect(store.steps.map((s) => s.status)).toEqual(['approved', 'pending']);
    expect(store.events.slice(-2).map((e) => e.type)).toEqual(['step_approved', 'step_pending']);
    expect(store.events.at(-1)?.data).toMatchObject({ assigneeIds: [LUIS], stepOrder: 2 });
  });

  it('aprobar el último paso aprueba la ronda y escribe el evento approved', async () => {
    const { store, deps } = setup([step(1)]);
    await start(deps);
    await expect(decide(deps, ANA, store.steps[0]?.id ?? '')).resolves.toEqual({
      outcome: 'approved',
    });
    expect(store.instances[0]?.status).toBe('approved');
    expect(store.events.slice(-2).map((e) => e.type)).toEqual(['step_approved', 'approved']);
    expect(store.events.at(-1)?.actorUserId).toBeNull();
  });

  it('all: aprueba uno (parcial) y el segundo cierra el paso', async () => {
    const { store, deps } = setup([step(1, { rule: 'all' })]);
    await start(deps);
    const stepId = store.steps[0]?.id ?? '';

    await expect(decide(deps, ANA, stepId)).resolves.toEqual({ outcome: 'partial' });
    expect(store.steps[0]?.status).toBe('pending');
    expect(store.events.at(-1)).toMatchObject({
      type: 'step_approved',
      data: { stepClosed: false },
    });

    await expect(decide(deps, ROSA, stepId)).resolves.toEqual({ outcome: 'approved' });
    expect(store.steps[0]?.status).toBe('approved');
  });

  it('rechazar cierra la ronda y cancela los pasos en espera; el evento lleva el comentario', async () => {
    const { store, deps } = setup();
    await start(deps);
    await expect(
      decide(deps, ROSA, store.steps[0]?.id ?? '', 'reject', 'No corresponde'),
    ).resolves.toEqual({ outcome: 'rejected' });
    expect(store.steps.map((s) => s.status)).toEqual(['rejected', 'cancelled']);
    expect(store.instances[0]?.status).toBe('rejected');
    expect(store.events.at(-1)).toMatchObject({
      type: 'step_rejected',
      actorUserId: ROSA,
      comment: 'No corresponde',
    });
  });

  it('pedir cambios cierra la ronda como changes_requested', async () => {
    const { store, deps } = setup();
    await start(deps);
    await decide(deps, ANA, store.steps[0]?.id ?? '', 'request_changes', 'Revisa cantidades');
    expect(store.instances[0]?.status).toBe('changes_requested');
    expect(store.steps.map((s) => s.status)).toEqual(['changes_requested', 'cancelled']);
    expect(store.events.at(-1)).toMatchObject({ type: 'changes_requested' });
  });

  it('quien no es asignado recibe not_an_approver y no cambia nada', async () => {
    const { store, deps } = setup();
    await start(deps);
    const before = store.events.length;
    await expect(decide(deps, LUIS, store.steps[0]?.id ?? '')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'not_an_approver',
    });
    expect(store.events).toHaveLength(before);
  });

  it('el segundo aprobador de un paso any recibe step_already_decided', async () => {
    const { store, deps } = setup();
    await start(deps);
    const stepId = store.steps[0]?.id ?? '';
    await decide(deps, ANA, stepId);
    await expect(decide(deps, ROSA, stepId)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'step_already_decided',
    });
  });

  it('un paso de una ronda anterior se rechaza con step_already_decided', async () => {
    const { store, deps } = setup();
    await start(deps);
    const oldStep = store.steps[0]?.id ?? '';
    await decide(deps, ANA, oldStep, 'request_changes', 'Ajusta');
    await start(deps);
    await expect(decide(deps, ROSA, oldStep)).rejects.toMatchObject({
      reason: 'step_already_decided',
    });
  });

  it('sin instancia: approval_not_started', async () => {
    const { deps } = setup();
    await expect(decide(deps, ANA, 'x')).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'approval_not_started',
    });
  });

  it('un paso que no es de la solicitud: 404', async () => {
    const { deps } = setup();
    await start(deps);
    await expect(decide(deps, ANA, 'step-que-no-existe')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('un paso cancelado: INVALID_TRANSITION', async () => {
    const { store, deps } = setup();
    await start(deps);
    const stepId = store.steps[0]?.id ?? '';
    await cancelApproval(as(REQUESTER), { requestId: REQUEST, comment: 'Ya no se necesita' }, deps);
    await expect(decide(deps, ANA, stepId)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('cancelApproval', () => {
  it('cierra la ronda en curso, cancela los pasos y escribe el evento con el comentario', async () => {
    const { store, deps } = setup();
    await start(deps);
    await cancelApproval(as(REQUESTER), { requestId: REQUEST, comment: 'Duplicada' }, deps);
    expect(store.instances[0]?.status).toBe('cancelled');
    expect(store.steps.map((s) => s.status)).toEqual(['cancelled', 'cancelled']);
    expect(store.events.at(-1)).toMatchObject({
      type: 'cancelled',
      actorUserId: REQUESTER,
      comment: 'Duplicada',
      data: { round: 1 },
    });
  });

  it('sin instancia (borrador) solo escribe el evento', async () => {
    const { store, deps } = setup();
    await cancelApproval(as(REQUESTER), { requestId: REQUEST, comment: 'No va' }, deps);
    expect(store.instances).toHaveLength(0);
    expect(store.events).toEqual([
      expect.objectContaining({ type: 'cancelled', instanceId: null }),
    ]);
  });

  it('una ronda ya aprobada conserva su estado (solo se anota la anulación)', async () => {
    const { store, deps } = setup([step(1)]);
    await start(deps);
    await decide(deps, ANA, store.steps[0]?.id ?? '');
    await cancelApproval(as(REQUESTER), { requestId: REQUEST, comment: 'Error' }, deps);
    expect(store.instances[0]?.status).toBe('approved');
    expect(store.events.at(-1)?.type).toBe('cancelled');
  });
});
