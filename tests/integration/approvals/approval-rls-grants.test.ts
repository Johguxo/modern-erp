// E4-H2 · RLS, grants y constraints de las 4 tablas de instancias de aprobación con dos tenants
// (A y B): sin contexto no se ve nada, dentro de A solo se ven y tocan filas de A, no se escribe en
// B, app_user solo actualiza las columnas de 0018 y approval_events es solo insert.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';
import {
  approvalEvents,
  approvalInstances,
  approvalStepAssignees,
  approvalSteps,
} from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import {
  seedApprovalWorld,
  sendRequest,
  storedAssignees,
  storedEvents,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: ApprovalWorld;
let B: ApprovalWorld;
let requestA = '';
let requestB = '';
const ids = {
  A: {} as Record<string, string>,
  B: {} as Record<string, string>,
};

const scopeA = () => ({ tenantId: A.world.tenantId, userId: A.world.userId });

const TABLES = [
  { name: 'approval_instances', table: approvalInstances, id: approvalInstances.id },
  { name: 'approval_steps', table: approvalSteps, id: approvalSteps.id },
  {
    name: 'approval_step_assignees',
    table: approvalStepAssignees,
    id: approvalStepAssignees.id,
  },
  { name: 'approval_events', table: approvalEvents, id: approvalEvents.id },
] as const;

async function idsOf(requestId: string): Promise<Record<string, string>> {
  const [instance] = await storedInstances(requestId);
  const [step] = await storedSteps(requestId);
  const [assignee] = await storedAssignees(step?.id ?? '');
  const [event] = await storedEvents(requestId);
  if (!instance || !step || !assignee || !event) throw new Error('instancia incompleta');
  return {
    approval_instances: instance.id,
    approval_steps: step.id,
    approval_step_assignees: assignee.id,
    approval_events: event.id,
  };
}

beforeAll(async () => {
  A = await seedApprovalWorld(fx);
  B = await seedApprovalWorld(fx);
  requestA = (await sendRequest(A.world)).id;
  requestB = (await sendRequest(B.world)).id;
  ids.A = await idsOf(requestA);
  ids.B = await idsOf(requestB);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  const error = await capturePgError(fn);
  expect(error.code).toBe('42501');
  expect(error.message).toContain('permission denied');
}

describe.each(TABLES)('$name', ({ name, table, id }) => {
  it('sin withTenant no se ve ninguna fila', async () => {
    expect(await getDb().select({ id }).from(table)).toHaveLength(0);
  });

  it('dentro de A solo se ven filas de A', async () => {
    const rows = await withTenant(scopeA(), (tx) => tx.select({ id }).from(table));
    const own = await getDbAdmin().select({ id }).from(table);
    expect(rows.map((r) => r.id)).toContain(ids.A[name]);
    expect(rows.map((r) => r.id)).not.toContain(ids.B[name]);
    expect(rows.length).toBeLessThan(own.length);
  });

  it('dentro de A no se encuentra la fila de B por id', async () => {
    const rows = await withTenant(scopeA(), (tx) =>
      tx
        .select({ id })
        .from(table)
        .where(eq(id, ids.B[name] ?? '')),
    );
    expect(rows).toEqual([]);
  });
});

describe('no se escribe en otro tenant', () => {
  it('insertar con tenant_id de B desde A lo niega RLS (las 4 tablas)', async () => {
    const stepB = ids.B.approval_steps ?? '';
    const inserts: (() => Promise<unknown>)[] = [
      () =>
        withTenant(scopeA(), (tx) =>
          tx.insert(approvalInstances).values({
            tenantId: B.world.tenantId,
            requestId: requestB,
            round: 9,
            policyId: ids.B.approval_instances ?? '',
            policySnapshot: {},
          }),
        ),
      () =>
        withTenant(scopeA(), (tx) =>
          tx.insert(approvalSteps).values({
            tenantId: B.world.tenantId,
            instanceId: ids.B.approval_instances ?? '',
            requestId: requestB,
            stepOrder: 9,
            name: 'X',
            rule: 'any',
            status: 'waiting',
          }),
        ),
      () =>
        withTenant(scopeA(), (tx) =>
          tx.insert(approvalStepAssignees).values({
            tenantId: B.world.tenantId,
            stepId: stepB,
            userId: A.world.userId,
          }),
        ),
      () =>
        withTenant(scopeA(), (tx) =>
          tx.insert(approvalEvents).values({
            tenantId: B.world.tenantId,
            requestId: requestB,
            type: 'cancelled',
            actorType: 'system',
          }),
        ),
    ];
    for (const insert of inserts) {
      const error = await capturePgError(insert);
      expect(error.code).toBe('42501');
    }
  });

  it('actualizar un paso o un asignado de B desde A no cambia nada', async () => {
    const step = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update approval_steps set comment = 'hackeado' where id = ${ids.B.approval_steps ?? ''} returning id`,
      ),
    );
    const assignee = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update approval_step_assignees set comment = 'hackeado' where id = ${ids.B.approval_step_assignees ?? ''} returning id`,
      ),
    );
    expect(step).toHaveLength(0);
    expect(assignee).toHaveLength(0);
    const [row] = await getDbAdmin()
      .select({ comment: approvalSteps.comment })
      .from(approvalSteps)
      .where(eq(approvalSteps.id, ids.B.approval_steps ?? ''));
    expect(row?.comment).toBeNull();
  });
});

describe('grants de app_user', () => {
  it('approval_events: solo insert y lectura (UPDATE y DELETE → 42501)', async () => {
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(
          sql`update approval_events set comment = 'x' where id = ${ids.A.approval_events ?? ''}`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`delete from approval_events where id = ${ids.A.approval_events ?? ''}`),
      ),
    );
    const inserted = await withTenant(scopeA(), (tx) =>
      tx
        .insert(approvalEvents)
        .values({
          tenantId: A.world.tenantId,
          requestId: requestA,
          type: 'cancelled',
          actorType: 'user',
          actorUserId: A.world.userId,
        })
        .returning({ id: approvalEvents.id }),
    );
    expect(inserted).toHaveLength(1);
  });

  it('approval_instances: UPDATE solo de status y updated_at; sin DELETE', async () => {
    const instanceId = ids.A.approval_instances ?? '';
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`update approval_instances set round = 7 where id = ${instanceId}`),
      ),
    );
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(
          sql`update approval_instances set policy_snapshot = '{}' where id = ${instanceId}`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`delete from approval_instances where id = ${instanceId}`),
      ),
    );
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update approval_instances set status = 'in_progress', updated_at = now() where id = ${instanceId} returning id`,
      ),
    );
    expect(updated).toHaveLength(1);
  });

  it('approval_steps: UPDATE solo de estado, decisión y fechas; sin DELETE', async () => {
    const stepId = ids.A.approval_steps ?? '';
    for (const column of [
      'step_order = 5',
      "name = 'otro'",
      "rule = 'all'",
      "kind = 'reconfirmation'",
    ]) {
      await expectDenied(() =>
        withTenant(scopeA(), (tx) =>
          tx.execute(sql`update approval_steps set ${sql.raw(column)} where id = ${stepId}`),
        ),
      );
    }
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`delete from approval_steps where id = ${stepId}`),
      ),
    );
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update approval_steps set comment = 'ok', updated_at = now() where id = ${stepId} returning id`,
      ),
    );
    expect(updated).toHaveLength(1);
  });

  it('approval_step_assignees: UPDATE solo de decision, decided_at y comment; sin DELETE', async () => {
    const assigneeId = ids.A.approval_step_assignees ?? '';
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(
          sql`update approval_step_assignees set user_id = ${B.world.userId} where id = ${assigneeId}`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`delete from approval_step_assignees where id = ${assigneeId}`),
      ),
    );
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update approval_step_assignees set decision = 'approved', decided_at = now(), comment = 'ok' where id = ${assigneeId} returning id`,
      ),
    );
    expect(updated).toHaveLength(1);
  });
});

describe('constraints', () => {
  const admin = () => getDbAdmin();

  it('una ronda por solicitud: (tenant, request, round) es único', async () => {
    const [existing] = await storedInstances(requestA);
    const error = await capturePgError(() =>
      admin()
        .insert(approvalInstances)
        .values({
          tenantId: A.world.tenantId,
          requestId: requestA,
          round: 1,
          policyId: existing?.policyId ?? '',
          policySnapshot: {},
        }),
    );
    expect(error.code).toBe('23505');
  });

  it('estados y reglas fuera de lista se rechazan (23514)', async () => {
    const [instance] = await storedInstances(requestA);
    const badInstance = await capturePgError(() =>
      admin()
        .insert(approvalInstances)
        .values({
          tenantId: A.world.tenantId,
          requestId: requestA,
          round: 8,
          policyId: instance?.policyId ?? '',
          policySnapshot: {},
          status: 'otro',
        }),
    );
    expect(badInstance.code).toBe('23514');
    const badStep = await capturePgError(() =>
      admin()
        .insert(approvalSteps)
        .values({
          tenantId: A.world.tenantId,
          instanceId: instance?.id ?? '',
          requestId: requestA,
          stepOrder: 8,
          name: 'X',
          rule: 'any',
          status: 'terminado',
        }),
    );
    expect(badStep.code).toBe('23514');
  });

  it('un paso de reconfirmación exige line_ids y uno normal no los admite (23514)', async () => {
    const [instance] = await storedInstances(requestA);
    const lineId = '00000000-0000-4000-8000-0000000000a1';
    const stepValues = (order: number, extra: Partial<typeof approvalSteps.$inferInsert>) => ({
      tenantId: A.world.tenantId,
      instanceId: instance?.id ?? '',
      requestId: requestA,
      stepOrder: order,
      name: 'Reconfirmación',
      rule: 'any',
      status: 'waiting',
      ...extra,
    });
    for (const [order, extra] of [
      [20, { kind: 'reconfirmation' }],
      [21, { kind: 'reconfirmation', lineIds: [] }],
      [22, { kind: 'normal', lineIds: [lineId] }],
    ] as [number, Partial<typeof approvalSteps.$inferInsert>][]) {
      const error = await capturePgError(() =>
        admin().insert(approvalSteps).values(stepValues(order, extra)),
      );
      expect(error.code).toBe('23514');
    }
    const [ok] = await admin()
      .insert(approvalSteps)
      .values(stepValues(23, { kind: 'reconfirmation', lineIds: [lineId] }))
      .returning({ id: approvalSteps.id });
    expect(ok).toBeDefined();
  });

  it('un asignado es un usuario o un correo externo, no ambos ni ninguno', async () => {
    const stepId = ids.A.approval_steps ?? '';
    for (const values of [
      { userId: null, externalEmail: null },
      { userId: A.world.userId, externalEmail: 'a@b.pe' },
    ]) {
      const error = await capturePgError(() =>
        admin()
          .insert(approvalStepAssignees)
          .values({ tenantId: A.world.tenantId, stepId, ...values }),
      );
      expect(error.code).toBe('23514');
    }
  });

  it('un usuario no se repite en el mismo paso', async () => {
    const [assignee] = await storedAssignees(ids.A.approval_steps ?? '');
    const error = await capturePgError(() =>
      admin()
        .insert(approvalStepAssignees)
        .values({
          tenantId: A.world.tenantId,
          stepId: ids.A.approval_steps ?? '',
          userId: assignee?.userId ?? null,
        }),
    );
    expect(error.code).toBe('23505');
  });

  it('un evento de usuario exige actor y los comentarios largos se rechazan', async () => {
    const noActor = await capturePgError(() =>
      admin().insert(approvalEvents).values({
        tenantId: A.world.tenantId,
        requestId: requestA,
        type: 'cancelled',
        actorType: 'user',
      }),
    );
    expect(noActor.code).toBe('23514');
    const longComment = await capturePgError(() =>
      admin()
        .insert(approvalEvents)
        .values({
          tenantId: A.world.tenantId,
          requestId: requestA,
          type: 'cancelled',
          actorType: 'system',
          comment: 'x'.repeat(501),
        }),
    );
    expect(longComment.code).toBe('23514');
  });
});
