// E4-H2 · Motor de aprobaciones con la base real y las mismas dependencias que arma la entrega
// (`requestsExtras`): envío, decisión (any/all), rechazo, cambios pedidos y reenvío, anulación,
// bandeja y visibilidad, eventos y auditoría.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readOnlyRequestsExtras, requestsExtras } from '@/app/_lib/requests';
import { closeDatabases, getDbAdmin } from '@/db/admin';
import { approvalPolicies, auditEvents, documentSequences, requests } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import { createApprovalEngine } from '@/modules/approvals';
import {
  cancelRequest,
  createDraft,
  createGetRequestDetailDeps,
  createListRequestsDeps,
  createRequestsDeps,
  decideRequest,
  getRequestDetail,
  listRequests,
  noopApprovalAssignments,
  noopApprovalCanceller,
  noopApprovalStarter,
  submitRequest,
} from '@/modules/requests';
import type { Ctx } from '@/shared/context';
import { makeCtx } from '@tests/support/ctx';

import {
  decideAs,
  seedApprovalWorld,
  sendRequest,
  setPolicySteps,
  storedAssignees,
  storedEvents,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  draftInput,
  insertRequest,
  runRequests,
  testShared,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let W: ApprovalWorld;
let B: ApprovalWorld;

const STANDARD_STEPS = [
  { name: 'Almacén', role: 'warehouse' as const },
  { name: 'Gerencia local', role: 'approver' as const },
];

beforeAll(async () => {
  W = await seedApprovalWorld(fx);
  B = await seedApprovalWorld(fx);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const detailOf = (ctx: Ctx, id: string) =>
  withTenant(ctx, (tx) =>
    getRequestDetail(ctx, { id }, createGetRequestDetailDeps(tx, readOnlyRequestsExtras(tx))),
  );

const summaryOf = (ctx: Ctx, tab: 'all' | 'awaiting_me' = 'all') =>
  withTenant(ctx, (tx) =>
    listRequests(
      ctx,
      { tab, q: null, page: 1, pageSize: 25 },
      createListRequestsDeps(tx, readOnlyRequestsExtras(tx)),
    ),
  );

const sequenceOf = async (tenantId: string) => {
  const [row] = await getDbAdmin()
    .select()
    .from(documentSequences)
    .where(eq(documentSequences.tenantId, tenantId));
  return row;
};

async function stepIdOf(requestId: string, order: number, round = 1): Promise<string> {
  const [instance] = (await storedInstances(requestId)).filter((i) => i.round === round);
  const step = (await storedSteps(requestId)).find(
    (s) => s.instanceId === instance?.id && s.stepOrder === order,
  );
  if (!step) throw new Error(`paso ${order} de la ronda ${round} no existe`);
  return step.id;
}

describe('composición de la entrega', () => {
  it('requestsExtras conecta el motor: ninguna pieza es el noop', () => {
    return withTenant(W.world.ctx, (tx) => {
      const extras = requestsExtras(testShared(), tx);
      expect(extras.approvals).toBeDefined();
      expect(extras.approvals).not.toBe(noopApprovalStarter);
      expect(extras.canceller).toBeDefined();
      expect(extras.canceller).not.toBe(noopApprovalCanceller);
      expect(extras.assignments).toBeDefined();
      expect(extras.assignments).not.toBe(noopApprovalAssignments);
      expect(extras.decider).toBeDefined();
      const readOnly = readOnlyRequestsExtras(tx);
      expect(readOnly.assignments).not.toBe(noopApprovalAssignments);
      return Promise.resolve();
    });
  });
});

describe('enviar', () => {
  it('crea la instancia ronda 1 con copia de la política, pasos, asignados y eventos', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    expect(sent.status).toBe('in_approval');
    expect(sent.number).toMatch(/^SOF-/);

    const [instance] = await storedInstances(sent.id);
    expect(instance).toMatchObject({ round: 1, status: 'in_progress' });
    expect(instance?.policySnapshot).toMatchObject({
      name: 'SOF estándar',
      total: sent.totalAmount,
      steps: [
        { order: 1, name: 'Almacén', role: 'warehouse', rule: 'any' },
        { order: 2, name: 'Gerencia local', role: 'approver', rule: 'any' },
      ],
    });

    const steps = await storedSteps(sent.id);
    expect(steps.map((s) => [s.stepOrder, s.status])).toEqual([
      [1, 'pending'],
      [2, 'waiting'],
    ]);
    expect(steps[0]?.pendingSince).not.toBeNull();
    expect(steps[1]?.pendingSince).toBeNull();
    const first = (await storedAssignees(steps[0]?.id ?? '')).map((a) => a.userId).sort();
    expect(first).toEqual([W.ana.userId, W.rosa.userId].sort());
    expect((await storedAssignees(steps[1]?.id ?? '')).map((a) => a.userId)).toEqual([
      W.luis.userId,
    ]);

    const events = await storedEvents(sent.id);
    expect(events.map((e) => [e.type, e.actorType])).toEqual([
      ['submitted', 'user'],
      ['step_pending', 'system'],
    ]);
    expect(events[0]).toMatchObject({
      actorUserId: W.world.userId,
      data: { round: 1, policyName: 'SOF estándar' },
    });
    expect(events[1]?.data).toMatchObject({ noAssignees: false, stepOrder: 1 });
  });

  it('el solicitante no queda asignado a su propia solicitud', async () => {
    // Ana crea y envía: el paso de almacén queda solo con Rosa.
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const ctx = makeCtx({
      tenantId: W.world.tenantId,
      userId: W.ana.userId,
      permissions: ['requests.create', 'requests.read_own'],
    });
    const draft = await runRequests(ctx, (deps) => createDraft(ctx, draftInput(W.world), deps));
    const sent = await runRequests(ctx, (deps) =>
      submitRequest(ctx, { id: draft.id, version: draft.version }, deps),
    );
    const steps = await storedSteps(sent.id);
    expect((await storedAssignees(steps[0]?.id ?? '')).map((a) => a.userId)).toEqual([
      W.rosa.userId,
    ]);
  });

  it('un paso sin asignados queda pendiente con noAssignees en el evento', async () => {
    await setPolicySteps(W.world.tenantId, [{ name: 'Compras', userIds: [W.world.userId] }]);
    const sent = await sendRequest(W.world);
    const steps = await storedSteps(sent.id);
    expect(steps[0]?.status).toBe('pending');
    expect(await storedAssignees(steps[0]?.id ?? '')).toEqual([]);
    const pending = (await storedEvents(sent.id)).find((e) => e.type === 'step_pending');
    expect(pending?.data).toMatchObject({ noAssignees: true, assigneeIds: [] });
  });

  it('un paso con un rol que no puede aprobar queda pendiente sin asignados', async () => {
    await addMember(fx, W.world, { fullName: 'Solo Solicitante', roles: ['requester'] });
    await setPolicySteps(W.world.tenantId, [{ name: 'Solicitantes', role: 'requester' }]);
    const sent = await sendRequest(W.world);
    const steps = await storedSteps(sent.id);
    expect(steps[0]?.status).toBe('pending');
    expect(await storedAssignees(steps[0]?.id ?? '')).toEqual([]);
    const pending = (await storedEvents(sent.id)).find((e) => e.type === 'step_pending');
    expect(pending?.data).toMatchObject({ noAssignees: true, assigneeIds: [] });
  });

  it('un usuario elegido que solo es solicitante se excluye de los asignados', async () => {
    const olga = await addMember(fx, W.world, {
      fullName: 'Olga Solicitante',
      roles: ['requester'],
    });
    await setPolicySteps(W.world.tenantId, [
      { name: 'Mixto', userIds: [olga.userId, W.luis.userId] },
    ]);
    const sent = await sendRequest(W.world);
    const steps = await storedSteps(sent.id);
    expect((await storedAssignees(steps[0]?.id ?? '')).map((a) => a.userId)).toEqual([
      W.luis.userId,
    ]);
  });

  it('sin approvals.decide no hay contador fantasma aunque conserve una asignación', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    expect((await summaryOf(W.ana.ctx)).summary.awaitingMe).toBeGreaterThan(0);
    // Mismo usuario, pero su sesión ya no tiene el permiso (le quitaron el rol).
    const demoted = makeCtx({
      tenantId: W.world.tenantId,
      userId: W.ana.userId,
      permissions: ['requests.read_own'],
    });
    expect((await summaryOf(demoted)).summary.awaitingMe).toBe(0);
    expect((await summaryOf(demoted, 'awaiting_me')).items.map((i) => i.id)).not.toContain(sent.id);
  });

  it('sin política activa: approval_policy_missing, nada se guarda y no se consume número', async () => {
    const before = await sequenceOf(W.world.tenantId);
    await getDbAdmin()
      .update(approvalPolicies)
      .set({ active: false })
      .where(eq(approvalPolicies.tenantId, W.world.tenantId));
    try {
      const draft = await runRequests(W.world.ctx, (deps) =>
        createDraft(W.world.ctx, draftInput(W.world), deps),
      );
      await expect(
        runRequests(W.world.ctx, (deps) =>
          submitRequest(W.world.ctx, { id: draft.id, version: draft.version }, deps),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'approval_policy_missing' });

      expect(await sequenceOf(W.world.tenantId)).toMatchObject({
        nextNumber: before?.nextNumber,
        lastIssuedNumber: before?.lastIssuedNumber,
      });
      const [row] = await getDbAdmin().select().from(requests).where(eq(requests.id, draft.id));
      expect(row).toMatchObject({ status: 'draft', number: null, version: 1 });
      expect(await storedInstances(draft.id)).toEqual([]);
    } finally {
      await getDbAdmin()
        .update(approvalPolicies)
        .set({ active: true })
        .where(eq(approvalPolicies.tenantId, W.world.tenantId));
    }
  });

  it('ningún paso aplica al total: approval_route_empty y se revierte', async () => {
    await setPolicySteps(W.world.tenantId, [
      { name: 'Solo montos altos', role: 'warehouse', condition: { min_amount: '999999.00' } },
    ]);
    const before = await sequenceOf(W.world.tenantId);
    const draft = await runRequests(W.world.ctx, (deps) =>
      createDraft(W.world.ctx, draftInput(W.world), deps),
    );
    await expect(
      runRequests(W.world.ctx, (deps) =>
        submitRequest(W.world.ctx, { id: draft.id, version: draft.version }, deps),
      ),
    ).rejects.toMatchObject({ reason: 'approval_route_empty' });
    expect((await sequenceOf(W.world.tenantId))?.nextNumber).toBe(before?.nextNumber);
  });

  it('editar la política después no cambia la instancia en curso', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const stepsBefore = await storedSteps(sent.id);
    const [instanceBefore] = await storedInstances(sent.id);

    await setPolicySteps(W.world.tenantId, [{ name: 'Otro flujo', role: 'approver', rule: 'all' }]);

    const stepsAfter = await storedSteps(sent.id);
    expect(stepsAfter.map((s) => [s.id, s.name, s.rule, s.status])).toEqual(
      stepsBefore.map((s) => [s.id, s.name, s.rule, s.status]),
    );
    const [instanceAfter] = await storedInstances(sent.id);
    expect(instanceAfter?.policySnapshot).toEqual(instanceBefore?.policySnapshot);
  });
});

describe('decidir', () => {
  it('any: Ana aprueba el paso 1, queda pendiente el 2 y Luis aprueba el documento', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);

    // El detalle de Ana (sin read_all: ve por asignación) trae el paso a decidir.
    const seen = await detailOf(W.ana.ctx, sent.id);
    expect(seen).toMatchObject({
      displayStatus: 'awaiting_my_approval',
      pendingStepId: step1,
      actions: ['approve', 'request_changes', 'reject', 'download_pdf'],
    });

    const afterAna = await decideAs(W.ana, {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'approve',
      comment: ' Conforme ',
    });
    expect(afterAna).toMatchObject({ status: 'in_approval', outcome: 'advanced', version: 3 });

    const steps = await storedSteps(sent.id);
    expect(steps.map((s) => s.status)).toEqual(['approved', 'pending']);
    expect(steps[0]).toMatchObject({ decidedBy: W.ana.userId, comment: 'Conforme' });
    expect(steps[1]?.pendingSince).not.toBeNull();

    // Ya no le toca a Ana; ahora le toca a Luis.
    expect((await detailOf(W.ana.ctx, sent.id)).pendingStepId).toBeNull();
    const step2 = await stepIdOf(sent.id, 2);
    expect((await detailOf(W.luis.ctx, sent.id)).pendingStepId).toBe(step2);

    const approved = await decideAs(W.luis, {
      id: sent.id,
      version: afterAna.version,
      stepId: step2,
      decision: 'approve',
      comment: null,
    });
    expect(approved).toMatchObject({ status: 'approved', outcome: 'approved', version: 4 });
    expect(approved.approvedAt).not.toBeNull();
    expect((await storedInstances(sent.id))[0]?.status).toBe('approved');
    expect((await storedEvents(sent.id)).map((e) => e.type)).toEqual([
      'submitted',
      'step_pending',
      'step_approved',
      'step_pending',
      'step_approved',
      'approved',
    ]);
  });

  it('all con dos asignados: el primero deja el paso abierto y el segundo lo cierra', async () => {
    await setPolicySteps(W.world.tenantId, [{ name: 'Almacén', role: 'warehouse', rule: 'all' }]);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);

    const first = await decideAs(W.ana, {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'approve',
      comment: null,
    });
    expect(first).toMatchObject({ status: 'in_approval', outcome: 'partial', version: 3 });
    expect((await storedSteps(sent.id))[0]?.status).toBe('pending');
    // Ana ya aprobó: no le queda nada pendiente y la bandeja de Rosa sigue mostrándolo.
    expect((await detailOf(W.ana.ctx, sent.id)).pendingStepId).toBeNull();
    expect((await detailOf(W.rosa.ctx, sent.id)).pendingStepId).toBe(step1);

    // Con la versión que vio antes de que Ana aprobara, Rosa recibe stale_version y no se guarda nada.
    await expect(
      decideAs(W.rosa, {
        id: sent.id,
        version: sent.version,
        stepId: step1,
        decision: 'approve',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'stale_version' });
    expect((await storedSteps(sent.id))[0]?.status).toBe('pending');

    const second = await decideAs(W.rosa, {
      id: sent.id,
      version: first.version,
      stepId: step1,
      decision: 'approve',
      comment: null,
    });
    expect(second).toMatchObject({ status: 'approved', outcome: 'approved' });
    expect((await storedAssignees(step1)).every((a) => a.decision === 'approved')).toBe(true);
  });

  it('rechaza si no es asignado, si es la propia solicitud o si el documento es de otro tenant', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);
    const input = {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'approve' as const,
      comment: null,
    };

    // Luis es del paso 2, no del 1.
    await expect(decideAs(W.luis, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'not_an_approver',
    });
    // El solicitante con permiso de decidir sigue sin poder decidir lo suyo.
    const own = {
      ctx: makeCtx({
        tenantId: W.world.tenantId,
        userId: W.world.userId,
        permissions: ['requests.create', 'approvals.decide'],
      }),
    };
    await expect(decideAs(own, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'own_request',
    });
    // Un aprobador de otro tenant no ve el documento: 404.
    await expect(decideAs(B.ana, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await storedSteps(sent.id))[0]?.status).toBe('pending');
  });

  it('sin approvals.decide: 403 aunque sea asignado', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const noPermission = {
      ctx: makeCtx({
        tenantId: W.world.tenantId,
        userId: W.ana.userId,
        permissions: ['requests.read_own'],
      }),
    };
    await expect(
      decideAs(noPermission, {
        id: sent.id,
        version: sent.version,
        stepId: await stepIdOf(sent.id, 1),
        decision: 'approve',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rechazar exige comentario, cierra la ronda y cancela los pasos en espera', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);
    const input = {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'reject' as const,
    };

    await expect(decideAs(W.ana, { ...input, comment: '  ' })).rejects.toMatchObject({
      code: 'VALIDATION',
      reason: 'decision_comment_required',
    });
    const rejected = await decideAs(W.ana, { ...input, comment: 'No corresponde' });

    expect(rejected).toMatchObject({ status: 'rejected', outcome: 'rejected', version: 3 });
    expect(rejected.closedAt).not.toBeNull();
    expect(rejected.closedBy).toBeNull();
    expect((await storedSteps(sent.id)).map((s) => s.status)).toEqual(['rejected', 'cancelled']);
    expect((await storedInstances(sent.id))[0]?.status).toBe('rejected');
    const last = (await storedEvents(sent.id)).at(-1);
    expect(last).toMatchObject({
      type: 'step_rejected',
      actorUserId: W.ana.userId,
      comment: 'No corresponde',
    });
  });

  it('pedir cambios cancela los pasos en espera y el reenvío abre la ronda 2 sin tocar la 1', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const round1Step1 = await stepIdOf(sent.id, 1);

    const asked = await decideAs(W.ana, {
      id: sent.id,
      version: sent.version,
      stepId: round1Step1,
      decision: 'request_changes',
      comment: 'Falta el equipo',
    });
    expect(asked).toMatchObject({ status: 'changes_requested', outcome: 'changes_requested' });
    expect((await storedSteps(sent.id)).map((s) => s.status)).toEqual([
      'changes_requested',
      'cancelled',
    ]);
    const eventsRound1 = await storedEvents(sent.id);

    // El solicitante reenvía: conserva el número y la secuencia no avanza.
    const seqBefore = await sequenceOf(W.world.tenantId);
    const resent = await runRequests(W.world.ctx, (deps) =>
      submitRequest(W.world.ctx, { id: sent.id, version: asked.version }, deps),
    );
    expect(resent).toMatchObject({ status: 'in_approval', number: sent.number });
    expect((await sequenceOf(W.world.tenantId))?.nextNumber).toBe(seqBefore?.nextNumber);

    const instances = await storedInstances(sent.id);
    expect(instances.map((i) => [i.round, i.status])).toEqual([
      [1, 'changes_requested'],
      [2, 'in_progress'],
    ]);
    const steps = await storedSteps(sent.id);
    expect(steps.map((s) => s.status)).toEqual([
      'changes_requested',
      'cancelled',
      'pending',
      'waiting',
    ]);

    // Los eventos de la ronda 1 siguen intactos y la ronda 2 agrega los suyos.
    const events = await storedEvents(sent.id);
    expect(events.slice(0, eventsRound1.length)).toEqual(eventsRound1);
    expect(events.slice(eventsRound1.length).map((e) => e.type)).toEqual([
      'resubmitted',
      'step_pending',
    ]);
    expect(events.at(-2)?.data).toMatchObject({ round: 2 });

    // El paso de la ronda 1 ya no se puede decidir.
    await expect(
      decideAs(W.rosa, {
        id: sent.id,
        version: resent.version,
        stepId: round1Step1,
        decision: 'approve',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'step_already_decided' });

    // La ronda 2 sí.
    const approved = await decideAs(W.rosa, {
      id: sent.id,
      version: resent.version,
      stepId: await stepIdOf(sent.id, 1, 2),
      decision: 'approve',
      comment: null,
    });
    expect(approved).toMatchObject({ outcome: 'advanced' });
  });

  it('un SOF «En aprobación» sin instancia (anterior al motor): approval_not_started y se puede anular', async () => {
    const legacyId = await insertRequest(W.world, { status: 'in_approval' });
    const reader = {
      ctx: makeCtx({
        tenantId: W.world.tenantId,
        userId: W.ana.userId,
        permissions: ['requests.read_all', 'approvals.decide'],
      }),
    };
    await expect(
      decideAs(reader, {
        id: legacyId,
        version: 1,
        stepId: '99999999-9999-4999-8999-999999999999',
        decision: 'approve',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'approval_not_started' });

    const cancelled = await runRequests(W.world.ctx, (deps) =>
      cancelRequest(W.world.ctx, { id: legacyId, version: 1, comment: 'Anterior al motor' }, deps),
    );
    expect(cancelled.status).toBe('cancelled');
  });
});

describe('anular', () => {
  it('cierra la ronda y sus pasos y escribe el evento cancelled con el comentario', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);

    const cancelled = await runRequests(W.world.ctx, (deps) =>
      cancelRequest(
        W.world.ctx,
        { id: sent.id, version: sent.version, comment: 'Pedido duplicado' },
        deps,
      ),
    );

    expect(cancelled.status).toBe('cancelled');
    expect((await storedInstances(sent.id))[0]?.status).toBe('cancelled');
    expect((await storedSteps(sent.id)).map((s) => s.status)).toEqual(['cancelled', 'cancelled']);
    expect((await storedEvents(sent.id)).at(-1)).toMatchObject({
      type: 'cancelled',
      actorUserId: W.world.userId,
      comment: 'Pedido duplicado',
    });
    // Ya no esperan nada de Ana, y decidir un paso cancelado es una transición inválida.
    expect((await detailOf(W.ana.ctx, sent.id)).pendingStepId).toBeNull();
    await expect(
      decideAs(W.ana, {
        id: sent.id,
        version: cancelled.version,
        stepId: await stepIdOf(sent.id, 1),
        decision: 'approve',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('un borrador anulado solo deja el evento, sin instancia', async () => {
    const draft = await runRequests(W.world.ctx, (deps) =>
      createDraft(W.world.ctx, draftInput(W.world), deps),
    );
    await runRequests(W.world.ctx, (deps) =>
      cancelRequest(
        W.world.ctx,
        { id: draft.id, version: draft.version, comment: 'Ya no lo necesito' },
        deps,
      ),
    );
    expect(await storedInstances(draft.id)).toEqual([]);
    expect((await storedEvents(draft.id)).map((e) => [e.type, e.instanceId])).toEqual([
      ['cancelled', null],
    ]);
  });
});

describe('bandeja y visibilidad', () => {
  it('«Esperan mi aprobación» cuenta el paso pendiente de cada aprobador y se mueve con las decisiones', async () => {
    const tenantWorld = await seedApprovalWorld(fx);
    await setPolicySteps(tenantWorld.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(tenantWorld.world);

    const awaiting = (member: ApprovalWorld['ana']) =>
      summaryOf(member.ctx).then((r) => r.summary.awaitingMe);
    expect(await awaiting(tenantWorld.ana)).toBe(1);
    expect(await awaiting(tenantWorld.rosa)).toBe(1);
    expect(await awaiting(tenantWorld.luis)).toBe(0);
    const tab = await summaryOf(tenantWorld.ana.ctx, 'awaiting_me');
    expect(tab.items.map((i) => i.id)).toEqual([sent.id]);

    const step1 = await stepIdOf(sent.id, 1);
    await decideAs(tenantWorld.ana, {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'approve',
      comment: null,
    });
    expect(await awaiting(tenantWorld.ana)).toBe(0);
    expect(await awaiting(tenantWorld.rosa)).toBe(0);
    expect(await awaiting(tenantWorld.luis)).toBe(1);

    // La asignación también da visibilidad: Ana (sin read_all) sigue viendo el documento.
    expect((await summaryOf(tenantWorld.ana.ctx)).items.map((i) => i.id)).toContain(sent.id);
  });

  it('un usuario no asignado y sin read_all no ve el documento (404)', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const stranger = await addMember(fx, W.world, {
      fullName: 'Ajeno',
      permissions: ['requests.read_own'],
    });
    await expect(detailOf(stranger.ctx, sent.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('eventos y auditoría', () => {
  it('cada decisión audita request.decided y el envío request.submitted', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);
    await decideAs(W.ana, {
      id: sent.id,
      version: sent.version,
      stepId: step1,
      decision: 'approve',
      comment: 'Ok',
    });

    const audit = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, W.world.tenantId), eq(auditEvents.entityId, sent.id)));
    const decided = audit.find((a) => a.action === 'request.decided');
    expect(decided).toMatchObject({
      actorUserId: W.ana.userId,
      data: { decision: 'approve', outcome: 'advanced', stepId: step1, comment: 'Ok' },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['request.created', 'request.submitted', 'request.decided']),
    );
  });
});

describe('transacción única', () => {
  it('si algo falla después de que el motor decidió, todo se revierte (paso, asignado y versión)', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const step1 = await stepIdOf(sent.id, 1);

    await expect(
      withTenant(W.ana.ctx, (tx) => {
        const shared = testShared();
        const engine = createApprovalEngine(tx, { clock: shared.clock, logger: shared.logger });
        const deps = createRequestsDeps(tx, {
          ...requestsExtras(shared, tx),
          decider: {
            decide: async (ctx, input) => {
              await engine.decider.decide(ctx, input);
              throw new Error('boom');
            },
          },
        });
        return decideRequest(
          W.ana.ctx,
          { id: sent.id, version: sent.version, stepId: step1, decision: 'approve', comment: null },
          deps,
        );
      }),
    ).rejects.toThrow('boom');

    const [row] = await getDbAdmin().select().from(requests).where(eq(requests.id, sent.id));
    expect(row).toMatchObject({ status: 'in_approval', version: sent.version });
    expect((await storedSteps(sent.id)).map((s) => s.status)).toEqual(['pending', 'waiting']);
    expect((await storedAssignees(step1)).every((a) => a.decision === null)).toBe(true);
    expect((await storedEvents(sent.id)).map((e) => e.type)).toEqual(['submitted', 'step_pending']);
  });
});
