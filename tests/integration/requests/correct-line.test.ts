// E4-H4 · Corregir una línea sin reiniciar, con la base real y el motor de aprobaciones: las tres
// ramas de la regla de reaprobación, agregar y quitar, edición en sitio en «Cambios solicitados»,
// aislamiento entre tenants, concurrencia real y RLS/grants de las revisiones de línea.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { approvalPolicies, requestLineRevisions, requestLines, requests } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  correctLine,
  updateDraft,
  type CorrectLineInput,
  type RequestView,
} from '@/modules/requests';

import {
  decideAs,
  seedApprovalWorld,
  sendRequest,
  storedEvents,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';
import { addMember, draftInput, runRequests, type Member } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let W: ApprovalWorld;
let B: ApprovalWorld;
let carla: Member;

beforeAll(async () => {
  W = await seedApprovalWorld(fx);
  B = await seedApprovalWorld(fx);
  carla = await addMember(fx, W.world, {
    fullName: 'Carla Corrección',
    permissions: ['requests.correct_line', 'requests.read_all', 'catalog.manage'],
    roles: ['warehouse'],
  });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const correctAs = (member: Pick<Member, 'ctx'>, input: CorrectLineInput) =>
  runRequests(member.ctx, (deps) => correctLine(member.ctx, input, deps));

const setTolerance = (tenantId: string, pct: string | null) =>
  getDbAdmin()
    .update(approvalPolicies)
    .set({ settings: pct === null ? {} : { reapproval_tolerance_pct: pct } })
    .where(eq(approvalPolicies.tenantId, tenantId));

const firstLine = (view: RequestView) => {
  const line = view.lines[0];
  if (!line) throw new Error('sin líneas');
  return line;
};

/** Cambia el campo indicado de la línea, conservando el resto de sus valores. */
function update(
  view: RequestView,
  lineIndex: number,
  patch: Partial<{ quantity: string; unitPrice: string; equipmentId: string | null }>,
  reason = 'Corrección de prueba',
): CorrectLineInput {
  const line = view.lines[lineIndex];
  if (!line) throw new Error('sin línea');
  return {
    id: view.id,
    version: view.version,
    reason,
    change: {
      type: 'update',
      lineId: line.id,
      productId: line.productId,
      quantity: patch.quantity ?? line.quantity,
      unitPrice: patch.unitPrice ?? line.unitPrice,
      equipmentId: patch.equipmentId === undefined ? line.equipmentId : patch.equipmentId,
      notes: line.notes,
    },
  };
}

const approveStep = async (member: Member, view: RequestView, stepIndex: number) => {
  const step = (await storedSteps(view.id))[stepIndex];
  if (!step) throw new Error('sin paso');
  return decideAs(member, {
    id: view.id,
    version: view.version,
    stepId: step.id,
    decision: 'approve',
  });
};

/** SOF enviado y aprobado por Ana (almacén) y Luis (gerencia). */
async function approvedRequest(world = W): Promise<RequestView> {
  const sent = await sendRequest(world.world);
  const afterAna = await approveStep(world.ana, sent, 0);
  return approveStep(world.luis, afterAna, 1);
}

const storedLines = (requestId: string) =>
  getDbAdmin().select().from(requestLines).where(eq(requestLines.requestId, requestId));
const storedRevisions = (requestId: string) =>
  getDbAdmin()
    .select()
    .from(requestLineRevisions)
    .where(eq(requestLineRevisions.requestId, requestId));
const storedRequest = async (id: string) =>
  (await getDbAdmin().select().from(requests).where(eq(requests.id, id)))[0];

describe('las tres ramas de la regla de reaprobación', () => {
  it('sin cambio de monto (equipo): las firmas se mantienen y queda la revisión anterior', async () => {
    await setTolerance(W.world.tenantId, null);
    const approved = await approvedRequest();
    expect(approved.status).toBe('approved');

    const view = await correctAs(carla, update(approved, 0, { equipmentId: null }));

    expect(view).toMatchObject({
      status: 'approved',
      branch: 'amount_unchanged',
      reconfirmation: false,
      version: approved.version + 1,
      totalAmount: approved.totalAmount,
    });
    expect(firstLine(view)).toMatchObject({ revision: 2, equipmentId: null });
    const revisions = await storedRevisions(approved.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      revision: 1,
      changedBy: carla.userId,
      reason: 'Corrección de prueba',
      snapshot: { equipmentId: W.world.equipmentId, quantity: '2.000', revision: 1 },
    });
    const events = await storedEvents(approved.id);
    expect(events.at(-1)).toMatchObject({ type: 'line_corrected', actorUserId: carla.userId });
    expect(events.at(-1)?.data).toMatchObject({ branch: 'amount_unchanged', changeType: 'update' });
    expect((await storedInstances(approved.id))[0]?.status).toBe('approved');
    expect(await storedSteps(approved.id)).toHaveLength(2);
  });

  it('dentro de la tolerancia: baja o sube poco y las firmas se mantienen', async () => {
    await setTolerance(W.world.tenantId, '50');
    const approved = await approvedRequest();

    const view = await correctAs(carla, update(approved, 0, { quantity: '3.000' }));

    expect(view).toMatchObject({ status: 'approved', branch: 'within_tolerance' });
    expect(view.totalAmount).not.toBe(approved.totalAmount);
    expect(await storedSteps(approved.id)).toHaveLength(2);
    await setTolerance(W.world.tenantId, null);
  });

  it('sobre la tolerancia con el SOF aprobado: reconfirmación, gerencia aprueba y vuelve a approved', async () => {
    const approved = await approvedRequest();

    const view = await correctAs(carla, update(approved, 0, { quantity: '9.000' }));

    expect(view).toMatchObject({
      status: 'in_approval',
      approvedAt: null,
      branch: 'above_tolerance',
      reconfirmation: true,
    });
    expect(firstLine(view)).toMatchObject({ quantity: '9.000', needsReconfirmation: true });
    expect((await storedInstances(approved.id))[0]?.status).toBe('in_progress');
    const steps = await storedSteps(approved.id);
    expect(steps).toHaveLength(3);
    expect(steps[2]).toMatchObject({
      kind: 'reconfirmation',
      status: 'pending',
      name: 'Reconfirmación',
      stepOrder: 3,
      lineIds: [firstLine(view).id],
    });
    const types = (await storedEvents(approved.id)).slice(-3).map((e) => e.type);
    expect(types).toEqual(['line_corrected', 'reconfirmation_requested', 'step_pending']);

    const done = await approveStep(W.luis, view, 2);
    expect(done).toMatchObject({ status: 'approved', outcome: 'approved' });
    expect(done.lines.every((line) => !line.needsReconfirmation)).toBe(true);
    expect((await storedLines(approved.id)).every((l) => !l.needsReconfirmation)).toBe(true);
    expect((await storedInstances(approved.id))[0]?.status).toBe('approved');
    expect((await storedRequest(approved.id))?.approvedAt).not.toBeNull();
  });

  it('en in_approval con solo almacén firmado: no hay a quién pedir, no hay paso y las firmas siguen', async () => {
    const sent = await sendRequest(W.world);
    const afterAna = await approveStep(W.ana, sent, 0);

    const view = await correctAs(carla, update(afterAna, 0, { quantity: '9.000' }));

    expect(view).toMatchObject({
      status: 'in_approval',
      branch: 'above_tolerance',
      reconfirmation: false,
    });
    expect(firstLine(view).needsReconfirmation).toBe(false);
    expect(await storedSteps(sent.id)).toHaveLength(2);
    const last = (await storedEvents(sent.id)).at(-1);
    expect(last).toMatchObject({ type: 'line_corrected' });
    expect(last?.data).toMatchObject({ reconfirmation: false, branch: 'above_tolerance' });
  });

  it('un borrador ajeno nunca se envió: es 404 para quien corrige', async () => {
    const draft = await runRequests(W.world.ctx, async (deps) => {
      const { createDraft } = await import('@/modules/requests');
      return createDraft(W.world.ctx, draftInput(W.world), deps);
    });
    await expect(correctAs(carla, update(draft, 0, { quantity: '5.000' }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('agregar y quitar líneas', () => {
  it('agrega con el siguiente número, quita guardando la revisión y no deja quitar la última', async () => {
    await setTolerance(W.world.tenantId, null);
    const sent = await sendRequest(W.world);

    const added = await correctAs(carla, {
      id: sent.id,
      version: sent.version,
      reason: 'Faltaba un perno',
      change: {
        type: 'add',
        productId: W.world.productIds.bolt,
        quantity: '2',
        unitPrice: '3.3333',
        equipmentId: null,
        notes: null,
      },
    });
    expect(added.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
    expect(added.branch).toBe('above_tolerance');
    expect(await storedRevisions(sent.id)).toHaveLength(0);

    const [first, second, third] = added.lines;
    const removed = await correctAs(carla, {
      id: sent.id,
      version: added.version,
      reason: 'No se necesita',
      change: { type: 'remove', lineId: third?.id ?? '' },
    });
    expect(removed.lines.find((l) => l.id === third?.id)).toMatchObject({
      status: 'removed',
      revision: 2,
    });
    expect(removed.totalAmount).toBe(sent.totalAmount);
    expect(await storedRevisions(sent.id)).toHaveLength(1);

    let version = removed.version;
    for (const line of [first, second]) {
      const attempt = correctAs(carla, {
        id: sent.id,
        version,
        reason: 'Quitar',
        change: { type: 'remove', lineId: line?.id ?? '' },
      });
      if (line === first) {
        version = (await attempt).version;
      } else {
        await expect(attempt).rejects.toMatchObject({ reason: 'last_line' });
      }
    }
  });
});

describe('edición en sitio en «Cambios solicitados»', () => {
  it('después de una corrección, el solicitante edita sin perder líneas ni revisiones', async () => {
    const sent = await sendRequest(W.world);
    const corrected = await correctAs(carla, update(sent, 0, { equipmentId: null }));
    const asked = await decideAs(W.ana, {
      id: sent.id,
      version: corrected.version,
      stepId: (await storedSteps(sent.id))[0]?.id ?? '',
      decision: 'request_changes',
      comment: 'Revisar',
    });
    expect(asked.status).toBe('changes_requested');
    const lineIds = (await storedLines(sent.id)).map((l) => l.id).sort();

    const edited = await runRequests(W.world.ctx, (deps) =>
      updateDraft(
        W.world.ctx,
        {
          id: sent.id,
          version: asked.version,
          ...draftInput(W.world, {
            lines: [
              {
                productId: W.world.productIds.filter,
                quantity: '4.000',
                equipmentId: null,
                notes: null,
              },
            ],
          }),
        },
        deps,
      ),
    );

    expect(edited.lines.map((l) => [l.lineNo, l.status])).toEqual([
      [1, 'active'],
      [2, 'removed'],
    ]);
    expect((await storedLines(sent.id)).map((l) => l.id).sort()).toEqual(lineIds);
    expect(await storedRevisions(sent.id)).toHaveLength(1);
  });
});

describe('aislamiento entre tenants (A/B)', () => {
  it('un corrector de A no ve ni corrige un SOF de B, y B no cambia', async () => {
    const sentB = await sendRequest(B.world);
    await expect(correctAs(carla, update(sentB, 0, { quantity: '9.000' }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await storedRevisions(sentB.id)).toHaveLength(0);
    expect((await storedRequest(sentB.id))?.version).toBe(sentB.version);
    expect((await storedLines(sentB.id)).every((l) => l.revision === 1)).toBe(true);
  });

  it('las revisiones de A no se leen ni se insertan desde B (RLS)', async () => {
    const sentA = await sendRequest(W.world);
    await correctAs(carla, update(sentA, 0, { equipmentId: null }));
    const [revision] = await storedRevisions(sentA.id);
    if (!revision) throw new Error('sin revisión');

    const seenFromB = await withTenant(
      { tenantId: B.world.tenantId, userId: B.world.userId },
      (tx) =>
        tx.select().from(requestLineRevisions).where(eq(requestLineRevisions.id, revision.id)),
    );
    expect(seenFromB).toHaveLength(0);

    const error = await capturePgError(() =>
      withTenant({ tenantId: B.world.tenantId, userId: B.world.userId }, (tx) =>
        tx.insert(requestLineRevisions).values({
          tenantId: W.world.tenantId,
          requestId: sentA.id,
          requestLineId: revision.requestLineId,
          revision: 9,
          snapshot: {},
          changedBy: B.world.userId,
          reason: 'x',
        }),
      ),
    );
    expect(error.code).toBe('42501');
    expect(error.message).toMatch(/row-level security/);
  });

  it('el repositorio filtra por tenant aun sin RLS: appendRevision y updateLine de otro tenant no actúan', async () => {
    const sentA = await sendRequest(W.world);
    const line = firstLine(sentA);
    const repoOf = (tenantId: string, userId: string) =>
      withTenant({ tenantId, userId }, async (tx) => {
        const { createDrizzleRequestRepository } =
          await import('@/modules/requests/infrastructure/drizzle-request-repository');
        const repo = createDrizzleRequestRepository(tx);
        await expect(
          repo.appendRevision(B.world.tenantId, {
            requestId: sentA.id,
            requestLineId: line.id,
            revision: 1,
            snapshot: {},
            changedBy: userId,
            reason: 'x',
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
          repo.updateLine(B.world.tenantId, line.id, 1, { status: 'removed' }),
        ).rejects.toMatchObject({ reason: 'stale_version' });
        await repo.flagReconfirmation(B.world.tenantId, line.id);
        await repo.clearReconfirmation(B.world.tenantId, sentA.id);
      });
    await repoOf(B.world.tenantId, B.world.userId);
    expect((await storedLines(sentA.id)).find((l) => l.id === line.id)).toMatchObject({
      status: 'active',
      revision: 1,
      needsReconfirmation: false,
    });
  });
});

describe('concurrencia real (cada una en su transacción y conexión)', () => {
  it('una corrección y una decisión con la misma versión: una gana y la otra recibe stale_version', async () => {
    for (let round = 0; round < 3; round += 1) {
      const sent = await sendRequest(W.world);
      const stepId = (await storedSteps(sent.id))[0]?.id ?? '';
      const results = await Promise.allSettled([
        correctAs(carla, update(sent, 0, { equipmentId: null })),
        decideAs(W.ana, { id: sent.id, version: sent.version, stepId, decision: 'approve' }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect((failed as PromiseRejectedResult).reason).toMatchObject({
        code: 'CONFLICT',
        reason: 'stale_version',
      });
      expect((await storedRequest(sent.id))?.version).toBe(sent.version + 1);
      const revisions = await storedRevisions(sent.id);
      const events = (await storedEvents(sent.id)).map((e) => e.type);
      // Lo que perdió no dejó nada: revisión y evento solo existen si ganó la corrección.
      expect(revisions.length).toBe(events.includes('line_corrected') ? 1 : 0);
    }
  });

  it('dos correcciones con la misma versión: una gana y la otra recibe stale_version', async () => {
    for (let round = 0; round < 3; round += 1) {
      const sent = await sendRequest(W.world);
      const results = await Promise.allSettled([
        correctAs(carla, update(sent, 0, { equipmentId: null })),
        correctAs(carla, update(sent, 1, { quantity: '9.000' })),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect((failed as PromiseRejectedResult).reason).toMatchObject({ reason: 'stale_version' });
      expect(await storedRevisions(sent.id)).toHaveLength(1);
      expect((await storedRequest(sent.id))?.version).toBe(sent.version + 1);
    }
  });
});

describe('RLS y grants de las revisiones y las líneas', () => {
  it('request_line_revisions: sin UPDATE ni DELETE para app_user; request_lines sin cambiar tenant_id', async () => {
    const sent = await sendRequest(W.world);
    await correctAs(carla, update(sent, 0, { equipmentId: null }));
    const [revision] = await storedRevisions(sent.id);
    const scope = { tenantId: W.world.tenantId, userId: W.world.userId };
    for (const statement of [
      sql`update request_line_revisions set reason = 'x' where id = ${revision?.id ?? ''}`,
      sql`delete from request_line_revisions where id = ${revision?.id ?? ''}`,
      sql`update request_lines set tenant_id = ${B.world.tenantId} where request_id = ${sent.id}`,
    ]) {
      const error = await capturePgError(() => withTenant(scope, (tx) => tx.execute(statement)));
      expect(error.code).toBe('42501');
    }
  });

  it('no se borra una línea de un SOF en in_approval (corregir es status = removed)', async () => {
    const sent = await sendRequest(W.world);
    const scope = { tenantId: W.world.tenantId, userId: W.world.userId };
    const deleted = await withTenant(scope, (tx) =>
      tx.execute(sql`delete from request_lines where request_id = ${sent.id} returning id`),
    );
    expect(deleted).toHaveLength(0);
  });

  it('sin requests.correct_line la corrección es 403', async () => {
    const sent = await sendRequest(W.world);
    await expect(
      correctAs({ ctx: W.ana.ctx }, update(sent, 0, { equipmentId: null })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
