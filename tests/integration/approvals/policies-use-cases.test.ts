// E4-H1 · Casos de uso de políticas con la base real: lectura, guardado con bloqueo optimista,
// validación de aprobadores (usuario de otro tenant o desactivado), auditoría, condición conservada,
// aislamiento entre tenants y vista previa de la ruta con min_amount.
import { makeCtx } from '@tests/support/ctx';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { approvalPolicies, approvalPolicySteps, auditEvents, memberships } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  createGetPolicyDeps,
  createPolicyAdminDeps,
  createPreviewRouteDeps,
  getPolicy,
  previewRoute,
  updatePolicySteps,
  type UpdatePolicyStepsInput,
} from '@/modules/approvals';
import { updatePolicyStepsContract } from '@/modules/approvals/contracts';
import type { Ctx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  seedRequestsWorld,
  type Member,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let adminCtx: Ctx;
let adminB: Ctx;
let requesterCtx: Ctx;
let warehouse: Member;
let manager: Member;
let disabled: Member;
let outsider: Member;

const admin = () => getDbAdmin();

function adminOf(world: RequestsWorld): Ctx {
  return makeCtx({
    tenantId: world.tenantId,
    userId: world.userId,
    permissions: ['approval_policies.manage', 'requests.create'],
  });
}

const read = (ctx: Ctx) =>
  withTenant(ctx, (tx) => getPolicy(ctx, { docType: 'SOF' }, createGetPolicyDeps(tx)));

const save = (ctx: Ctx, input: UpdatePolicyStepsInput) =>
  withTenant(ctx, (tx) =>
    updatePolicySteps(ctx, input, createPolicyAdminDeps(tx, { client: UNKNOWN_CLIENT })),
  );

const preview = (ctx: Ctx, total: string | null) =>
  withTenant(ctx, (tx) => previewRoute(ctx, { docType: 'SOF', total }, createPreviewRouteDeps(tx)));

async function storedSteps(tenantId: string) {
  return admin()
    .select()
    .from(approvalPolicySteps)
    .where(eq(approvalPolicySteps.tenantId, tenantId))
    .orderBy(asc(approvalPolicySteps.stepOrder));
}

async function storedVersion(tenantId: string): Promise<number> {
  const [row] = await admin()
    .select({ version: approvalPolicies.version })
    .from(approvalPolicies)
    .where(eq(approvalPolicies.tenantId, tenantId));
  return row?.version ?? 0;
}

const roleStep = (name: string, role: 'warehouse' | 'approver' | 'purchasing') => ({
  name,
  approverType: 'role' as const,
  role,
  userIds: [] as string[],
  rule: 'any' as const,
  condition: {},
});

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  adminCtx = adminOf(A);
  adminB = adminOf(B);
  requesterCtx = makeCtx({
    tenantId: A.tenantId,
    userId: A.userId,
    permissions: ['requests.create'],
  });
  warehouse = await addMember(fx, A, { fullName: 'Ana Almacén', roles: ['warehouse'] });
  manager = await addMember(fx, A, { fullName: 'Gabi Gerencia', roles: ['approver'] });
  disabled = await addMember(fx, A, { fullName: 'Dani Desactivado', roles: ['approver'] });
  await admin()
    .update(memberships)
    .set({ status: 'disabled' })
    .where(and(eq(memberships.tenantId, A.tenantId), eq(memberships.userId, disabled.userId)));
  outsider = await addMember(fx, B, { fullName: 'Otto Ajeno', roles: ['approver'] });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('getPolicy', () => {
  it('devuelve la política estándar con sus pasos y solo los miembros activos del tenant', async () => {
    const view = await read(adminCtx);

    expect(view).toMatchObject({ docType: 'SOF', name: 'SOF estándar', version: 1 });
    expect(view.steps.map((s) => [s.name, s.approverType, s.role, s.rule])).toEqual([
      ['Almacén', 'role', 'warehouse', 'any'],
      ['Gerencia local', 'role', 'approver', 'any'],
    ]);
    const names = view.members.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['Ana Almacén', 'Gabi Gerencia']));
    expect(names).not.toContain('Dani Desactivado');
    expect(names).not.toContain('Otto Ajeno');
    expect(view.steps.every((s) => s.warnings.length === 0)).toBe(true);
  });

  it('un rol sin miembros activos genera la advertencia', async () => {
    const view = await read(adminCtx);
    expect(view.steps[0]?.warnings).toEqual([]);

    const saved = await save(adminCtx, {
      docType: 'SOF',
      version: view.version,
      steps: [roleStep('Compras', 'purchasing')],
    });
    expect(saved.steps[0]?.warnings).toEqual([{ type: 'role_without_members' }]);
    await restoreStandard();
  });

  it('el solicitante sin approval_policies.manage recibe FORBIDDEN', async () => {
    await expect(read(requesterCtx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function restoreStandard() {
  const view = await read(adminCtx);
  await save(adminCtx, {
    docType: 'SOF',
    version: view.version,
    steps: [roleStep('Almacén', 'warehouse'), roleStep('Gerencia local', 'approver')],
  });
}

describe('updatePolicySteps', () => {
  it('reemplaza los pasos, sube la versión, audita y no toca al otro tenant', async () => {
    const before = await read(adminCtx);
    const versionB = await storedVersion(B.tenantId);
    const stepsB = await storedSteps(B.tenantId);

    const saved = await save(adminCtx, {
      docType: 'SOF',
      version: before.version,
      steps: [
        {
          name: 'Gerencia',
          approverType: 'users',
          role: null,
          userIds: [manager.userId, warehouse.userId],
          rule: 'all',
          condition: {},
        },
        roleStep('Almacén', 'warehouse'),
      ],
    });

    expect(saved.version).toBe(before.version + 1);
    expect(saved.steps.map((s) => s.name)).toEqual(['Gerencia', 'Almacén']);
    const stored = await storedSteps(A.tenantId);
    expect(stored.map((s) => [s.stepOrder, s.name, s.approverType, s.approverRef, s.rule])).toEqual(
      [
        [1, 'Gerencia', 'users', [manager.userId, warehouse.userId], 'all'],
        [2, 'Almacén', 'role', 'warehouse', 'any'],
      ],
    );

    expect(await storedVersion(B.tenantId)).toBe(versionB);
    expect(await storedSteps(B.tenantId)).toEqual(stepsB);

    const events = await admin()
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, A.tenantId),
          eq(auditEvents.action, 'approval_policy.updated'),
        ),
      );
    const event = events.find(
      (e) => (e.data as { toVersion?: number }).toVersion === saved.version,
    );
    expect(event).toMatchObject({
      actorUserId: A.userId,
      entityType: 'approval_policy',
      data: { docType: 'SOF', fromVersion: before.version, toVersion: saved.version },
    });
    const data = event?.data as { before: unknown[]; after: { name: string }[] };
    expect(data.before).toHaveLength(2);
    expect(data.after.map((s) => s.name)).toEqual(['Gerencia', 'Almacén']);
    await restoreStandard();
  });

  it('con una versión vieja falla con stale_version y no cambia nada', async () => {
    const view = await read(adminCtx);
    const stale = save(adminCtx, {
      docType: 'SOF',
      version: view.version - 1,
      steps: [roleStep('Compras', 'purchasing')],
    });
    await expect(stale).rejects.toMatchObject({ code: 'CONFLICT', reason: 'stale_version' });
    expect(await storedVersion(A.tenantId)).toBe(view.version);
    expect((await storedSteps(A.tenantId)).map((s) => s.name)).toEqual([
      'Almacén',
      'Gerencia local',
    ]);
  });

  it('dos guardados con la misma versión: uno gana y el otro recibe stale_version', async () => {
    const view = await read(adminCtx);
    const input = (name: string) => ({
      docType: 'SOF' as const,
      version: view.version,
      steps: [roleStep(name, 'approver')],
    });

    const results = await Promise.allSettled([
      save(adminCtx, input('Primero')),
      save(adminCtx, input('Segundo')),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'CONFLICT', reason: 'stale_version' } });
    expect(await storedVersion(A.tenantId)).toBe(view.version + 1);
    await restoreStandard();
  });

  it.each([
    ['un usuario de otro tenant', () => outsider.userId],
    ['un usuario desactivado', () => disabled.userId],
    ['un usuario que no existe', () => '99999999-9999-4999-8999-999999999999'],
  ])('rechaza %s con approver_not_member y no cambia nada', async (_label, pick) => {
    const view = await read(adminCtx);
    const failing = save(adminCtx, {
      docType: 'SOF',
      version: view.version,
      steps: [
        {
          name: 'Gerencia',
          approverType: 'users',
          role: null,
          userIds: [manager.userId, pick()],
          rule: 'any',
          condition: {},
        },
      ],
    });

    await expect(failing).rejects.toMatchObject({
      code: 'VALIDATION',
      reason: 'approver_not_member',
      fieldErrors: { 'steps.0.userIds': ['approver_not_member'] },
    });
    expect(await storedVersion(A.tenantId)).toBe(view.version);
  });

  it('sin pasos y con un paso sin aprobadores falla con su motivo', async () => {
    const view = await read(adminCtx);
    await expect(
      save(adminCtx, { docType: 'SOF', version: view.version, steps: [] }),
    ).rejects.toMatchObject({ reason: 'policy_without_steps' });
    await expect(
      save(adminCtx, {
        docType: 'SOF',
        version: view.version,
        steps: [{ ...roleStep('Vacío', 'approver'), approverType: 'users', role: null }],
      }),
    ).rejects.toMatchObject({ reason: 'step_without_approvers' });
  });

  it('conserva la condición del paso (también claves que el MVP no evalúa) al guardar', async () => {
    const condition = { min_amount: '5000.00', cost_center_ids: ['cc-1'] };
    const view = await read(adminCtx);
    const saved = await save(adminCtx, {
      docType: 'SOF',
      version: view.version,
      steps: [
        roleStep('Almacén', 'warehouse'),
        { ...roleStep('Hong Kong', 'approver'), condition },
      ],
    });
    expect(saved.steps[1]?.condition).toEqual(condition);

    // Como lo manda la pantalla: lo que devolvió getPolicy pasa por el contrato Zod y se guarda igual.
    const reloaded = await read(adminCtx);
    const parsed = updatePolicyStepsContract.inputSchema.parse({
      docType: 'SOF',
      version: reloaded.version,
      steps: reloaded.steps.map((step) => ({ ...step, warnings: undefined })),
    });
    await save(adminCtx, parsed);

    expect((await storedSteps(A.tenantId))[1]?.condition).toEqual(condition);
    await restoreStandard();
  });

  it('el solicitante sin approval_policies.manage recibe FORBIDDEN', async () => {
    await expect(
      save(requesterCtx, { docType: 'SOF', version: 1, steps: [roleStep('X', 'approver')] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('el admin de B no ve ni cambia la política de A', async () => {
    const viewB = await read(adminB);
    expect(viewB.members.map((m) => m.name)).not.toContain('Ana Almacén');
    expect(viewB.members.map((m) => m.name)).toContain('Otto Ajeno');
    // Un usuario de A no es miembro de B.
    await expect(
      save(adminB, {
        docType: 'SOF',
        version: viewB.version,
        steps: [
          {
            name: 'Cruce',
            approverType: 'users',
            role: null,
            userIds: [warehouse.userId],
            rule: 'any',
            condition: {},
          },
        ],
      }),
    ).rejects.toMatchObject({ reason: 'approver_not_member' });
  });
});

describe('previewRoute con la política real', () => {
  it('resuelve aprobadores por rol y por usuarios, y respeta min_amount', async () => {
    const view = await read(adminCtx);
    await save(adminCtx, {
      docType: 'SOF',
      version: view.version,
      steps: [
        roleStep('Almacén', 'warehouse'),
        {
          name: 'Gerencia local',
          approverType: 'users',
          role: null,
          userIds: [manager.userId],
          rule: 'any',
          condition: {},
        },
        { ...roleStep('Hong Kong', 'approver'), condition: { min_amount: '5000.00' } },
      ],
    });

    const small = await preview(requesterCtx, '4999.99');
    expect(small.steps.map((s) => s.name)).toEqual(['Almacén', 'Gerencia local']);
    expect(small.steps[0]?.approvers.map((a) => a.name)).toEqual(['Ana Almacén']);
    expect(small.steps[1]?.approvers.map((a) => a.name)).toEqual(['Gabi Gerencia']);

    const big = await preview(requesterCtx, '5000.00');
    expect(big.steps.map((s) => s.name)).toEqual(['Almacén', 'Gerencia local', 'Hong Kong']);
    // El rol approver incluye a Gabi y no al usuario desactivado ni al de otro tenant.
    expect(big.steps[2]?.approvers.map((a) => a.name)).toEqual(['Gabi Gerencia']);

    expect((await preview(requesterCtx, null)).steps).toHaveLength(2);
    await restoreStandard();
  });

  it('omite a un usuario desactivado de un paso de usuarios', async () => {
    // Se fuerza a nivel de base (la pantalla no lo permitiría): un paso con un usuario que se desactivó.
    await admin()
      .update(memberships)
      .set({ status: 'disabled' })
      .where(and(eq(memberships.tenantId, A.tenantId), eq(memberships.userId, manager.userId)));
    const [policy] = await admin()
      .select({ id: approvalPolicies.id })
      .from(approvalPolicies)
      .where(eq(approvalPolicies.tenantId, A.tenantId));
    await admin()
      .update(approvalPolicySteps)
      .set({ approverType: 'users', approverRef: [manager.userId, warehouse.userId] })
      .where(
        and(
          eq(approvalPolicySteps.policyId, policy?.id ?? ''),
          eq(approvalPolicySteps.stepOrder, 2),
        ),
      );

    const route = await preview(requesterCtx, null);
    expect(route.steps[1]?.approvers.map((a) => a.name)).toEqual(['Ana Almacén']);
    const view = await read(adminCtx);
    expect(view.steps[1]?.warnings).toEqual([
      { type: 'inactive_users', userIds: [manager.userId] },
    ]);
    expect(view.inactiveUsers).toEqual([{ userId: manager.userId, name: 'Gabi Gerencia' }]);

    await admin()
      .update(memberships)
      .set({ status: 'active' })
      .where(and(eq(memberships.tenantId, A.tenantId), eq(memberships.userId, manager.userId)));
    await restoreStandard();
  });

  it('un tenant sin política recibe NotFound', async () => {
    const empty = await fx.tenant();
    const user = await fx.user();
    await fx.membership(empty.id, user.id, { roles: ['admin'] });
    const ctx = makeCtx({
      tenantId: empty.id,
      userId: user.id,
      permissions: ['requests.create', 'approval_policies.manage'],
    });
    await expect(preview(ctx, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(read(ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
