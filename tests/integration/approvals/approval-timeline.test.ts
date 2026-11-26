// E4-H3 · Línea de tiempo del detalle con la base real y las dependencias de la entrega: los
// eventos de todas las rondas más el paso pendiente (con sus asignados) y los que esperan; el
// respaldo derivado de las fechas para los SOF sin instancia; y el aislamiento entre tenants.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readOnlyRequestsExtras } from '@/app/_lib/requests';
import { closeDatabases } from '@/db/admin';
import { withTenant } from '@/db/with-tenant';
import { createApprovalEngine } from '@/modules/approvals';
import {
  cancelRequest,
  createDraft,
  createGetRequestDetailDeps,
  getRequestDetail,
  submitRequest,
  type RequestDetail,
} from '@/modules/requests';
import type { Ctx } from '@/shared/context';
import { systemClock } from '@/shared/adapters/system-clock';
import { getLogger } from '@/shared/adapters/pino-logger';

import {
  decideAs,
  seedApprovalWorld,
  sendRequest,
  setPolicySteps,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  DEFAULT_RUN_AT,
  draftInput,
  insertRequest,
  runRequests,
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

/** `kind:state` y, cuando el ítem es de un paso, `:Nombre del paso`. */
const shape = (detail: RequestDetail) =>
  detail.timeline.map(
    (item) => `${item.kind}:${item.state}${item.stepName ? `:${item.stepName}` : ''}`,
  );

async function stepIdOf(requestId: string, order: number, round = 1): Promise<string> {
  const [instance] = (await storedInstances(requestId)).filter((i) => i.round === round);
  const step = (await storedSteps(requestId)).find(
    (s) => s.instanceId === instance?.id && s.stepOrder === order,
  );
  if (!step) throw new Error(`paso ${order} de la ronda ${round} no existe`);
  return step.id;
}

const decision = (
  sent: { id: string; version: number },
  stepId: string,
  kind: 'approve' | 'reject' | 'request_changes',
  comment: string | null = null,
) => ({ id: sent.id, version: sent.version, stepId, decision: kind, comment });

describe('línea de tiempo con instancia', () => {
  it('recién enviada: el paso pendiente con sus asignados y los que esperan', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const detail = await detailOf(W.world.ctx, sent.id);

    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'approval:pending:Almacén',
      'approval:upcoming:Gerencia local',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[2]).toMatchObject({
      rule: 'any',
      assigneeNames: ['Ana Almacén', 'Rosa Almacén'],
      at: DEFAULT_RUN_AT.toISOString(),
    });
    expect(detail.timeline[3]).toMatchObject({ assigneeNames: [], at: null });
  });

  it('aprobar un paso: «Aprobado» con actor y comentario, y el siguiente queda pendiente', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    await decideAs(W.ana, decision(sent, await stepIdOf(sent.id, 1), 'approve', 'Hay stock'));
    const detail = await detailOf(W.world.ctx, sent.id);

    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'step_approved:done:Almacén',
      'approval:pending:Gerencia local',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[2]).toMatchObject({
      actorName: 'Ana Almacén',
      comment: 'Hay stock',
    });
    expect(detail.timeline[3]).toMatchObject({ assigneeNames: ['Luis Gerencia'] });
  });

  it('aprobar todo: la aprobación cierra la línea, con la entrega por delante', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const first = await decideAs(W.ana, decision(sent, await stepIdOf(sent.id, 1), 'approve'));
    await decideAs(W.luis, decision(first, await stepIdOf(sent.id, 2), 'approve'));
    const detail = await detailOf(W.world.ctx, sent.id);

    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'step_approved:done:Almacén',
      'step_approved:done:Gerencia local',
      'approved:done',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[3]?.actorName).toBe('Luis Gerencia');
  });

  it('regla «todos»: tras la primera firma el paso sigue pendiente solo con quien falta', async () => {
    await setPolicySteps(W.world.tenantId, [
      { name: 'Almacén', role: 'warehouse', rule: 'all' },
      { name: 'Gerencia local', role: 'approver' },
    ]);
    const sent = await sendRequest(W.world);
    const before = await detailOf(W.world.ctx, sent.id);
    expect(before.timeline[2]).toMatchObject({
      rule: 'all',
      assigneeNames: ['Ana Almacén', 'Rosa Almacén'],
    });

    await decideAs(W.ana, decision(sent, await stepIdOf(sent.id, 1), 'approve'));
    const detail = await detailOf(W.world.ctx, sent.id);
    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'step_signed:done:Almacén',
      'approval:pending:Almacén',
      'approval:upcoming:Gerencia local',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[2]).toMatchObject({ actorName: 'Ana Almacén' });
    expect(detail.timeline[3]).toMatchObject({ rule: 'all', assigneeNames: ['Rosa Almacén'] });
  });

  it('pedir cambios y reenviar: las dos rondas quedan en la línea', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const asked = await decideAs(
      W.ana,
      decision(sent, await stepIdOf(sent.id, 1), 'request_changes', 'Falta el equipo'),
    );

    const stopped = await detailOf(W.world.ctx, sent.id);
    expect(shape(stopped)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped:Almacén',
      'approval:upcoming',
      'delivery:upcoming',
    ]);
    expect(stopped.timeline[2]).toMatchObject({
      actorName: 'Ana Almacén',
      comment: 'Falta el equipo',
    });

    await runRequests(W.world.ctx, (deps) =>
      submitRequest(W.world.ctx, { id: sent.id, version: asked.version }, deps),
    );
    const detail = await detailOf(W.world.ctx, sent.id);
    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped:Almacén',
      'resubmitted:done',
      'approval:pending:Almacén',
      'approval:upcoming:Gerencia local',
      'delivery:upcoming',
    ]);
  });

  it('rechazar en la ronda 2 con el reloj fijo: el orden sale de los eventos, no de las fechas del paso', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const asked = await decideAs(
      W.ana,
      decision(sent, await stepIdOf(sent.id, 1), 'request_changes', 'Ronda 1: falta el equipo'),
    );
    const resent = await runRequests(W.world.ctx, (deps) =>
      submitRequest(W.world.ctx, { id: sent.id, version: asked.version }, deps),
    );
    await decideAs(
      W.ana,
      decision(resent, await stepIdOf(sent.id, 1, 2), 'reject', 'Ronda 2: no corresponde'),
    );

    // Las dos decisiones se guardaron con el mismo instante del reloj fijo.
    const decided = (await storedSteps(sent.id)).filter((s) => s.decidedAt !== null);
    expect(new Set(decided.map((s) => s.decidedAt?.getTime())).size).toBe(1);

    const detail = await detailOf(W.world.ctx, sent.id);
    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped:Almacén',
      'resubmitted:done',
      'rejected:stopped:Almacén',
    ]);
    expect(detail.timeline.map((item) => item.comment)).toEqual([
      null,
      null,
      'Ronda 1: falta el equipo',
      null,
      'Ronda 2: no corresponde',
    ]);
    expect(detail.timeline.at(-1)?.actorName).toBe('Ana Almacén');
  });

  it('anular con cambios pedidos: la línea termina en «anulada», sin aprobación ni entrega', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    const asked = await decideAs(
      W.ana,
      decision(sent, await stepIdOf(sent.id, 1), 'request_changes', 'Falta el equipo'),
    );
    await runRequests(W.world.ctx, (deps) =>
      cancelRequest(
        W.world.ctx,
        { id: sent.id, version: asked.version, comment: 'Ya no se necesita' },
        deps,
      ),
    );
    const detail = await detailOf(W.world.ctx, sent.id);

    expect(shape(detail)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped:Almacén',
      'cancelled:stopped',
    ]);
    expect(detail.timeline.at(-1)).toMatchObject({ comment: 'Ya no se necesita' });
  });

  it('anular una enviada: quién anuló y el comentario, sin pasos abiertos ni entrega', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);
    await runRequests(W.world.ctx, (deps) =>
      cancelRequest(
        W.world.ctx,
        { id: sent.id, version: sent.version, comment: 'Pedido duplicado' },
        deps,
      ),
    );
    const detail = await detailOf(W.world.ctx, sent.id);

    expect(shape(detail)).toEqual(['created:done', 'submitted:done', 'cancelled:stopped']);
    expect(detail.timeline.at(-1)).toMatchObject({ comment: 'Pedido duplicado' });
    expect(detail.timeline.at(-1)?.actorName).toBeTruthy();
  });
});

describe('línea de tiempo sin instancia (respaldo con las fechas)', () => {
  it('un borrador anulado nunca enviado: creada y anulada', async () => {
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
    const detail = await detailOf(W.world.ctx, draft.id);
    expect(shape(detail)).toEqual(['created:done', 'cancelled:stopped']);
    expect(detail.timeline.at(-1)).toMatchObject({ comment: 'Ya no lo necesito' });
  });

  it('un SOF «En aprobación» anterior al motor usa la línea derivada de las fechas', async () => {
    const legacyId = await insertRequest(W.world, { status: 'in_approval' });
    const detail = await detailOf(W.world.ctx, legacyId);
    expect(detail.timeline.map((item) => item.kind)).toEqual([
      'created',
      'submitted',
      'approval',
      'delivery',
    ]);
    expect(detail.timeline[2]).toMatchObject({ state: 'pending', stepName: null });
  });
});

describe('aislamiento entre tenants', () => {
  it('B no ve la línea de tiempo de A, ni por el puerto ni por el detalle', async () => {
    await setPolicySteps(W.world.tenantId, STANDARD_STEPS);
    const sent = await sendRequest(W.world);

    const portOf = (ctx: Ctx) =>
      withTenant(ctx, (tx) =>
        createApprovalEngine(tx, { clock: systemClock, logger: getLogger() }).timeline.getTimeline(
          ctx,
          sent.id,
        ),
      );
    const own = await portOf(W.world.ctx);
    expect(own?.map((entry) => entry.kind)).toEqual(['submitted', 'step_pending', 'step_waiting']);
    expect(await portOf(B.world.ctx)).toBeNull();
    await expect(detailOf(B.world.ctx, sent.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
