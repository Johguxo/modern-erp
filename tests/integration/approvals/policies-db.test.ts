// E4-H1 · Tablas de políticas de aprobación: RLS con dos tenants (A y B), grants de app_user
// (migración 0016), checks y unicidad, paso de alta de createTenant y backfill de la migración 0016.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';
import { approvalPolicies, approvalPolicySteps } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import { standardPolicySetupStep } from '@/modules/approvals';
import { createPlatformStore, createTenant, type PlatformDeps } from '@/modules/identity';
import type { PlatformCtx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import {
  capturePgError,
  createIdentityFixtures,
  randomEmail,
  randomSlug,
} from '../helpers/identity-fixtures';
import { seedRequestsWorld, type RequestsWorld } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let policyA: string;
let policyB: string;
let platformCtx: PlatformCtx;

const scopeA = () => ({ tenantId: A.tenantId, userId: A.userId });
const admin = () => getDbAdmin();

async function policiesOf(tenantId: string) {
  return admin().select().from(approvalPolicies).where(eq(approvalPolicies.tenantId, tenantId));
}

async function stepsOf(tenantId: string) {
  return admin()
    .select()
    .from(approvalPolicySteps)
    .where(eq(approvalPolicySteps.tenantId, tenantId))
    .orderBy(asc(approvalPolicySteps.stepOrder));
}

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  policyA = (await policiesOf(A.tenantId))[0]?.id ?? '';
  policyB = (await policiesOf(B.tenantId))[0]?.id ?? '';
  const superAdmin = await fx.user();
  await fx.platformAdmin(superAdmin.id);
  platformCtx = { userId: superAdmin.id, requestId: 'req-approvals' };
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

describe('RLS con dos tenants', () => {
  it('sin withTenant no se ve ninguna política ni paso', async () => {
    expect(await getDb().select({ id: approvalPolicies.id }).from(approvalPolicies)).toHaveLength(
      0,
    );
    expect(
      await getDb().select({ id: approvalPolicySteps.id }).from(approvalPolicySteps),
    ).toHaveLength(0);
  });

  it('dentro de A solo se ven la política y los pasos de A', async () => {
    const { policies, steps } = await withTenant(scopeA(), async (tx) => ({
      policies: await tx.select().from(approvalPolicies),
      steps: await tx.select().from(approvalPolicySteps),
    }));

    expect(policies.map((p) => p.id)).toEqual([policyA]);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.tenantId === A.tenantId && s.policyId === policyA)).toBe(true);
  });

  it('dentro de A no se encuentra la política de B por id', async () => {
    const rows = await withTenant(scopeA(), (tx) =>
      tx.select().from(approvalPolicies).where(eq(approvalPolicies.id, policyB)),
    );
    expect(rows).toEqual([]);
  });

  it('insertar un paso con tenant_id de B desde A lo niega RLS', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx.insert(approvalPolicySteps).values({
          tenantId: B.tenantId,
          policyId: policyB,
          stepOrder: 3,
          name: 'Intruso',
          approverType: 'role',
          approverRef: 'admin',
        }),
      ),
    );
    expect(error.code).toBe('42501');
    expect(error.message).toContain('row-level security');
  });

  it('actualizar la versión de la política de B desde A no cambia nada', async () => {
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(sql`update approval_policies set version = 99 where id = ${policyB} returning id`),
    );
    expect(updated).toHaveLength(0);
    expect((await policiesOf(B.tenantId))[0]?.version).toBe(1);
  });

  it('borrar los pasos de B desde A no borra nada', async () => {
    await withTenant(scopeA(), (tx) =>
      tx.delete(approvalPolicySteps).where(eq(approvalPolicySteps.policyId, policyB)),
    );
    expect(await stepsOf(B.tenantId)).toHaveLength(2);
  });
});

describe('grants de app_user (migración 0016)', () => {
  it('approval_policies: sin INSERT ni DELETE; UPDATE solo de version y updated_at', async () => {
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(
          sql`insert into approval_policies (tenant_id, doc_type, name, active) values (${A.tenantId}, 'SOF', 'Otra', false)`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`delete from approval_policies where id = ${policyA}`),
      ),
    );
    for (const statement of [
      sql`update approval_policies set name = 'Hack' where id = ${policyA}`,
      sql`update approval_policies set active = false where id = ${policyA}`,
      sql`update approval_policies set tenant_id = ${B.tenantId} where id = ${policyA}`,
      sql`update approval_policies set priority = 1 where id = ${policyA}`,
    ]) {
      await expectDenied(() => withTenant(scopeA(), (tx) => tx.execute(statement)));
    }

    await withTenant(scopeA(), (tx) =>
      tx.execute(sql`update approval_policies set version = version + 1 where id = ${policyA}`),
    );
    expect((await policiesOf(A.tenantId))[0]?.version).toBe(2);
    await admin().execute(sql`update approval_policies set version = 1 where id = ${policyA}`);
  });

  it('approval_policy_steps: se insertan y se borran, pero no se editan', async () => {
    const [first] = await stepsOf(A.tenantId);
    await expectDenied(() =>
      withTenant(scopeA(), (tx) =>
        tx.execute(sql`update approval_policy_steps set name = 'Hack' where id = ${first?.id}`),
      ),
    );

    await withTenant(scopeA(), async (tx) => {
      await tx.delete(approvalPolicySteps).where(eq(approvalPolicySteps.policyId, policyA));
      await tx.insert(approvalPolicySteps).values({
        tenantId: A.tenantId,
        policyId: policyA,
        stepOrder: 1,
        name: 'Único',
        approverType: 'role',
        approverRef: 'admin',
      });
    });
    expect((await stepsOf(A.tenantId)).map((s) => s.name)).toEqual(['Único']);

    // Se restaura la política estándar para las demás pruebas.
    await admin().delete(approvalPolicySteps).where(eq(approvalPolicySteps.policyId, policyA));
    await admin().delete(approvalPolicies).where(eq(approvalPolicies.id, policyA));
    await standardPolicySetupStep(admin()).run({ tenantId: A.tenantId });
    policyA = (await policiesOf(A.tenantId))[0]?.id ?? '';
  });
});

describe('checks y unicidad', () => {
  const validStep = () => ({
    tenantId: B.tenantId,
    policyId: policyB,
    stepOrder: 9,
    name: 'Paso',
    approverType: 'role',
    approverRef: 'admin',
  });

  it('una sola política activa por tipo de documento en el tenant', async () => {
    const error = await capturePgError(() =>
      admin().insert(approvalPolicies).values({ tenantId: B.tenantId, docType: 'SOF', name: 'X' }),
    );
    expect(error.code).toBe('23505');
    expect(error.message).toContain('approval_policies_tenant_doc_type_active_key');
  });

  it('una política inactiva no choca con la activa', async () => {
    const [row] = await admin()
      .insert(approvalPolicies)
      .values({ tenantId: B.tenantId, docType: 'SOF', name: 'Vieja', active: false })
      .returning({ id: approvalPolicies.id });
    expect(row).toBeDefined();
    await admin()
      .delete(approvalPolicies)
      .where(eq(approvalPolicies.id, row?.id ?? ''));
  });

  it.each([
    ['tipo de documento desconocido', { docType: 'PR' }, 'approval_policies_doc_type_check'],
    ['nombre vacío', { name: '   ' }, 'approval_policies_name_check'],
    ['nombre de más de 80 caracteres', { name: 'x'.repeat(81) }, 'approval_policies_name_check'],
    ['versión 0', { version: 0 }, 'approval_policies_version_check'],
  ])('approval_policies rechaza %s', async (_label, override, constraint) => {
    const error = await capturePgError(() =>
      admin()
        .insert(approvalPolicies)
        .values({
          tenantId: B.tenantId,
          docType: 'SOF',
          name: 'Prueba',
          active: false,
          ...override,
        }),
    );
    expect(error.code).toBe('23514');
    expect(error.message).toContain(constraint);
  });

  it.each([
    ['orden 0', { stepOrder: 0 }, 'approval_policy_steps_step_order_check'],
    ['nombre vacío', { name: '' }, 'approval_policy_steps_name_check'],
    ['tipo de aprobador desconocido', { approverType: 'robot' }, 'approval_policy_steps_approver_'],
    ['regla desconocida', { rule: 'majority' }, 'approval_policy_steps_rule_check'],
    ['condición que no es objeto', { condition: [] }, 'approval_policy_steps_condition_check'],
    [
      'rol con una lista de usuarios',
      { approverType: 'role', approverRef: ['a'] },
      'approver_ref_check',
    ],
    [
      'usuarios con un texto',
      { approverType: 'users', approverRef: 'admin' },
      'approver_ref_check',
    ],
  ])('approval_policy_steps rechaza %s', async (_label, override, constraint) => {
    const error = await capturePgError(() =>
      admin()
        .insert(approvalPolicySteps)
        .values({ ...validStep(), ...override }),
    );
    expect(error.code).toBe('23514');
    expect(error.message).toContain(constraint);
  });

  it('el orden de los pasos es único dentro de la política', async () => {
    const error = await capturePgError(() =>
      admin()
        .insert(approvalPolicySteps)
        .values({ ...validStep(), stepOrder: 1 }),
    );
    expect(error.code).toBe('23505');
  });

  it('acepta pasos reservados (requester_manager y external_email) sin referencia de texto o lista', async () => {
    const rows = await admin()
      .insert(approvalPolicySteps)
      .values([
        { ...validStep(), stepOrder: 5, approverType: 'requester_manager', approverRef: {} },
        { ...validStep(), stepOrder: 6, approverType: 'external_email', approverRef: ['a@b.pe'] },
      ])
      .returning({ id: approvalPolicySteps.id });
    expect(rows).toHaveLength(2);
    await admin()
      .delete(approvalPolicySteps)
      .where(and(eq(approvalPolicySteps.policyId, policyB), sql`step_order in (5, 6)`));
  });
});

function platformDeps(): PlatformDeps {
  return {
    store: createPlatformStore([standardPolicySetupStep], admin()),
    mailer: { send: () => Promise.resolve({ messageId: 'm' }) },
    clock: new FixedClock(new Date()),
    logger: new CapturingLogger(),
    client: UNKNOWN_CLIENT,
    afterCommit: () => undefined,
    appUrl: 'http://localhost:3000',
  };
}

describe('paso de alta', () => {
  it('createTenant deja la política SOF estándar con sus dos pasos, solo en el tenant nuevo', async () => {
    const created = await createTenant(
      platformCtx,
      {
        name: 'Cliente nuevo',
        slug: randomSlug(),
        planCode: 'starter',
        maxUsers: null,
        currency: 'PEN',
        adminEmail: randomEmail(),
      },
      platformDeps(),
    );
    fx.trackTenant(created.tenantId);

    const policies = await policiesOf(created.tenantId);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      docType: 'SOF',
      name: 'SOF estándar',
      active: true,
      version: 1,
      priority: 100,
    });
    expect(
      (await stepsOf(created.tenantId)).map((s) => [
        s.stepOrder,
        s.name,
        s.approverType,
        s.approverRef,
        s.rule,
      ]),
    ).toEqual([
      [1, 'Almacén', 'role', 'warehouse', 'any'],
      [2, 'Gerencia local', 'role', 'approver', 'any'],
    ]);
  });

  it('es idempotente y no toca a otros tenants', async () => {
    const one = await fx.tenant();
    const other = await fx.tenant();

    await standardPolicySetupStep(admin()).run({ tenantId: one.id });
    await standardPolicySetupStep(admin()).run({ tenantId: one.id });

    expect(await policiesOf(one.id)).toHaveLength(1);
    expect(await stepsOf(one.id)).toHaveLength(2);
    expect(await policiesOf(other.id)).toHaveLength(0);
  });

  it('un alta que falla no deja política (misma transacción)', async () => {
    const input = {
      name: 'Falla',
      slug: randomSlug(),
      planCode: 'no-existe',
      maxUsers: null,
      currency: 'PEN' as const,
      adminEmail: randomEmail(),
    };
    await expect(createTenant(platformCtx, input, platformDeps())).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const rows = await admin().execute<{ n: number }>(
      sql`select count(*)::int as n from approval_policies p join tenants t on t.id = p.tenant_id where t.slug = ${input.slug}`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe('backfill de la migración 0016', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0016_approval_policies_privileges.sql'),
    'utf8',
  );
  const backfill = migration.slice(migration.indexOf('with new_policies'));

  it('crea la política estándar para un tenant sin una, respeta a los que ya la tienen y es idempotente', async () => {
    const legacy = await fx.tenant();
    const configured = await fx.tenant();
    await standardPolicySetupStep(admin()).run({ tenantId: configured.id });
    await admin()
      .update(approvalPolicies)
      .set({ name: 'Personalizada' })
      .where(eq(approvalPolicies.tenantId, configured.id));
    const before = await stepsOf(configured.id);

    // Acotado a estos dos tenants: el backfill real toca todos, y en paralelo otras pruebas crean
    // y borran tenants (la FK fallaría en una carrera).
    const scoped = backfill.replace(
      'where not exists',
      `where t.id in ('${legacy.id}', '${configured.id}') and not exists`,
    );
    expect(scoped).not.toBe(backfill);
    expect(backfill.match(/where not exists/g)).toHaveLength(1);
    await admin().execute(sql.raw(scoped));
    await admin().execute(sql.raw(scoped));

    const created = await policiesOf(legacy.id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ docType: 'SOF', name: 'SOF estándar', active: true });
    expect(
      (await stepsOf(legacy.id)).map((s) => [s.stepOrder, s.name, s.approverType, s.approverRef]),
    ).toEqual([
      [1, 'Almacén', 'role', 'warehouse'],
      [2, 'Gerencia local', 'role', 'approver'],
    ]);
    expect((await policiesOf(configured.id))[0]?.name).toBe('Personalizada');
    expect(await stepsOf(configured.id)).toEqual(before);
  });
});
