// E4-H4 · Corrección de una línea en el motor: tolerancia de la política, evento line_corrected y
// paso de reconfirmación (instancia y repositorio en memoria; la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { InMemoryApprovals } from '@tests/support/fakes/in-memory-approvals';
import { describe, expect, it } from 'vitest';

import type { Ctx } from '@/shared/context';

import type { PolicyStep } from '../domain/policy';

import { decideApproval } from './decide-approval-step';
import { readTolerance, recordCorrection, type RecordCorrectionInput } from './correct-approval';
import type { ApprovalEngineDeps, DirectoryMember } from './ports';
import { startApproval } from './start-approval';

const TENANT = '11111111-1111-4111-8111-111111111111';
const REQUESTER = '22222222-2222-4222-8222-222222222222';
const ANA = '33333333-3333-4333-8333-333333333333';
const ROSA = '44444444-4444-4444-8444-444444444444';
const LUIS = '55555555-5555-4555-8555-555555555555';
const REQUEST = '66666666-6666-4666-8666-666666666666';
const LINE = '77777777-7777-4777-8777-777777777777';

const members: DirectoryMember[] = [
  { userId: REQUESTER, name: 'Solicitante', roles: ['requester'], canDecide: false },
  { userId: ANA, name: 'Ana', roles: ['warehouse'], canDecide: true },
  { userId: ROSA, name: 'Rosa', roles: ['warehouse'], canDecide: true },
  { userId: LUIS, name: 'Luis', roles: ['approver'], canDecide: true },
];

const step = (order: number, overrides: Partial<PolicyStep> = {}): PolicyStep => ({
  order,
  name: order === 1 ? 'Almacén' : 'Gerencia',
  approverType: 'role',
  role: order === 1 ? 'warehouse' : 'approver',
  userIds: [],
  rule: 'any',
  condition: {},
  ...overrides,
});

function setup() {
  const store = new InMemoryApprovals();
  const logger = new CapturingLogger();
  const deps: ApprovalEngineDeps = {
    policies: {
      findActiveForStart: () =>
        Promise.resolve({
          id: 'pol-1',
          docType: 'SOF' as const,
          name: 'SOF estándar',
          version: 1,
          hasReservedSteps: false,
          steps: [step(1), step(2)],
        }),
    },
    directory: { activeMembers: () => Promise.resolve(members) },
    instances: store,
    events: store,
    clock: new FixedClock(),
    logger,
  };
  return { store, logger, deps };
}

const as = (userId: string): Ctx => makeCtx({ tenantId: TENANT, userId });

const start = (deps: ApprovalEngineDeps) =>
  startApproval(
    as(REQUESTER),
    { requestId: REQUEST, docType: 'SOF', totalAmount: '100.00', requesterId: REQUESTER },
    deps,
  );

const approve = (deps: ApprovalEngineDeps, userId: string, stepId: string) =>
  decideApproval(as(userId), { requestId: REQUEST, stepId, kind: 'approve', comment: null }, deps);

const correction = (overrides: Partial<RecordCorrectionInput> = {}): RecordCorrectionInput => ({
  requestId: REQUEST,
  requesterId: REQUESTER,
  lineId: LINE,
  lineNo: 3,
  changeType: 'update',
  reason: 'Cantidad mal registrada',
  before: { quantity: '2.000' },
  after: { quantity: '5.000' },
  changedFields: ['quantity'],
  branch: 'above_tolerance',
  previousTotal: '100.00',
  newTotal: '130.00',
  tolerancePct: '0',
  ...overrides,
});

const record = (deps: ApprovalEngineDeps, input: RecordCorrectionInput, userId = ROSA) =>
  recordCorrection(as(userId), input, deps);

/** Ana firma almacén y Luis gerencia: la ronda queda aprobada. */
async function approvedRound(ctx: ReturnType<typeof setup>) {
  await start(ctx.deps);
  await approve(ctx.deps, ANA, ctx.store.steps[0]?.id ?? '');
  await approve(ctx.deps, LUIS, ctx.store.steps[1]?.id ?? '');
  return ctx;
}

describe('readTolerance', () => {
  it('lee reapproval_tolerance_pct de la política de la ronda', async () => {
    const { store, deps } = setup();
    await start(deps);
    store.settings = { reapproval_tolerance_pct: '2.5' };
    await expect(readTolerance(as(ROSA), { requestId: REQUEST }, deps)).resolves.toEqual({
      tolerancePct: '2.5',
    });
  });

  it('si falta, vale 0 y queda en el log (info); si no es válida, también (warn)', async () => {
    const { store, logger, deps } = setup();
    await start(deps);
    await expect(readTolerance(as(ROSA), { requestId: REQUEST }, deps)).resolves.toEqual({
      tolerancePct: '0',
    });
    expect(logger.find('reapproval tolerance not configured: using 0')?.level).toBe('info');

    store.settings = { reapproval_tolerance_pct: '250' };
    await expect(readTolerance(as(ROSA), { requestId: REQUEST }, deps)).resolves.toEqual({
      tolerancePct: '0',
    });
    expect(logger.find('reapproval tolerance not configured: using 0')).toBeDefined();
  });

  it('sin instancia: approval_not_started', async () => {
    const { deps } = setup();
    await expect(readTolerance(as(ROSA), { requestId: REQUEST }, deps)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'approval_not_started',
    });
  });

  it('una ronda ya cerrada (cambios pedidos) tampoco se corrige', async () => {
    const { store, deps } = setup();
    await start(deps);
    await decideApproval(
      as(ANA),
      {
        requestId: REQUEST,
        stepId: store.steps[0]?.id ?? '',
        kind: 'request_changes',
        comment: 'x',
      },
      deps,
    );
    await expect(readTolerance(as(ROSA), { requestId: REQUEST }, deps)).rejects.toMatchObject({
      reason: 'approval_not_started',
    });
  });
});

describe('recordCorrection', () => {
  it('rama amount_unchanged o within_tolerance: solo el evento line_corrected; las firmas siguen', async () => {
    const ctx = await approvedRound(setup());
    const eventsBefore = ctx.store.events.length;

    await expect(
      record(ctx.deps, correction({ branch: 'within_tolerance', newTotal: '90.00' })),
    ).resolves.toEqual({ reconfirmation: false });

    expect(ctx.store.events.slice(eventsBefore).map((e) => e.type)).toEqual(['line_corrected']);
    expect(ctx.store.events.at(-1)).toMatchObject({
      actorUserId: ROSA,
      comment: 'Cantidad mal registrada',
      data: {
        lineId: LINE,
        lineNo: 3,
        changeType: 'update',
        before: { quantity: '2.000' },
        after: { quantity: '5.000' },
        branch: 'within_tolerance',
        reconfirmation: false,
        // El solicitante y quienes firmaron (Ana, Luis); no quien corrige.
        notifyUserIds: [REQUESTER, ANA, LUIS],
      },
    });
    expect(ctx.store.steps.map((s) => s.status)).toEqual(['approved', 'approved']);
    expect(ctx.store.instances[0]?.status).toBe('approved');
  });

  it('above_tolerance con la ronda aprobada: la reabre y crea el paso para quien firmó después de almacén', async () => {
    const ctx = await approvedRound(setup());
    const eventsBefore = ctx.store.events.length;

    await expect(record(ctx.deps, correction())).resolves.toEqual({ reconfirmation: true });

    expect(ctx.store.instances[0]?.status).toBe('in_progress');
    const created = ctx.store.steps[2];
    expect(created).toMatchObject({
      order: 3,
      name: 'Reconfirmación',
      kind: 'reconfirmation',
      rule: 'any',
      status: 'pending',
      lineIds: [LINE],
    });
    expect(created?.assignees.map((a) => a.userId)).toEqual([LUIS]);
    expect(ctx.store.events.slice(eventsBefore).map((e) => e.type)).toEqual([
      'line_corrected',
      'reconfirmation_requested',
      'step_pending',
    ]);
    expect(ctx.store.events.at(-2)).toMatchObject({
      stepId: created?.id,
      data: { lineIds: [LINE], lineNos: [3], assigneeIds: [LUIS] },
    });
    expect(ctx.store.events.at(-3)?.data).toMatchObject({ reconfirmation: true });
  });

  it('aprobar el paso de reconfirmación cierra la ronda de nuevo', async () => {
    const ctx = await approvedRound(setup());
    await record(ctx.deps, correction());
    const reconfirm = ctx.store.steps[2];

    await expect(approve(ctx.deps, LUIS, reconfirm?.id ?? '')).resolves.toEqual({
      outcome: 'approved',
    });
    expect(ctx.store.instances[0]?.status).toBe('approved');
  });

  it('above_tolerance con solo almacén firmado: no hay a quién pedir, no hay paso y queda en el log', async () => {
    const ctx = setup();
    await start(ctx.deps);
    await approve(ctx.deps, ANA, ctx.store.steps[0]?.id ?? '');
    // Gerencia sigue pendiente: nadie firmó después de almacén todavía.
    const eventsBefore = ctx.store.events.length;
    await expect(record(ctx.deps, correction())).resolves.toEqual({ reconfirmation: false });
    expect(ctx.store.steps).toHaveLength(2);
    expect(ctx.store.events.slice(eventsBefore).map((e) => e.type)).toEqual(['line_corrected']);
    expect(
      ctx.logger.find(
        'reconfirmation needed but no earlier approver can reconfirm: signatures kept',
      ),
    ).toBeDefined();
    expect(ctx.store.events.at(-1)?.data).toMatchObject({
      branch: 'above_tolerance',
      reconfirmation: false,
    });
  });

  it('la reconfirmación espera (waiting) cuando otro paso sigue pendiente', async () => {
    const ctx = setup();
    // Tres pasos: almacén, gerencia y un tercero; firman los dos primeros y el tercero sigue pendiente.
    const policy = {
      id: 'pol-3',
      docType: 'SOF' as const,
      name: 'SOF',
      version: 1,
      hasReservedSteps: false,
      steps: [step(1), step(2), step(3, { name: 'Dirección', role: 'approver' })],
    };
    const deps: ApprovalEngineDeps = {
      ...ctx.deps,
      policies: { findActiveForStart: () => Promise.resolve(policy) },
    };
    await start(deps);
    await approve(deps, ANA, ctx.store.steps[0]?.id ?? '');
    await approve(deps, LUIS, ctx.store.steps[1]?.id ?? '');

    await expect(record(deps, correction())).resolves.toEqual({ reconfirmation: true });

    expect(ctx.store.steps.map((s) => [s.order, s.status])).toEqual([
      [1, 'approved'],
      [2, 'approved'],
      [3, 'pending'],
      [4, 'waiting'],
    ]);
    expect(ctx.store.events.at(-1)?.type).toBe('reconfirmation_requested');
  });

  it('sin instancia o con la ronda cerrada: approval_not_started', async () => {
    const { deps } = setup();
    await expect(record(deps, correction())).rejects.toMatchObject({
      reason: 'approval_not_started',
    });
  });
});
