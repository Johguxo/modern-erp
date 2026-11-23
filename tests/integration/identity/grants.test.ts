// E1-H1 · Grants de app_user (migración 0002): "la política dice qué filas; los grants dicen qué
// operaciones". Las operaciones se prueban dentro de withTenant(A) sobre filas de A, para que RLS
// las permitiera: si fallan con "permission denied", es el grant el que las niega.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';
import {
  auditEvents,
  invitations,
  memberships,
  plans,
  subscriptions,
  tenantSettings,
  tenants,
  users,
} from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import { newId } from '../helpers/db';
import {
  capturePgError,
  createIdentityFixtures,
  FAR_FUTURE,
  randomEmail,
  randomSlug,
} from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: string;
let U: string;
let other: string;
let membershipOther: string;
let invitationA: string;
let auditA: string;
let subscriptionA: string;

const scope = () => ({ tenantId: A, userId: U });

beforeAll(async () => {
  A = (await fx.tenant()).id;
  U = (await fx.user()).id;
  other = (await fx.user()).id;
  await fx.membership(A, U, { roles: ['admin'] });
  membershipOther = (await fx.membership(A, other)).id;
  subscriptionA = (await fx.subscription(A, 'starter')).id;
  await fx.settings(A);
  invitationA = (await fx.invitation(A)).id;
  auditA = (await fx.auditEvent(A)).id;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  const error = await capturePgError(fn);
  expect(error.code).toBe('42501');
  expect(error.message).toMatch(/permission denied/);
}

describe('matriz de grants de app_user (tabla "Tablas, RLS y grants" del plan)', () => {
  it('cada tabla de identity tiene exactamente las operaciones del plan', async () => {
    const expected: Record<string, string[]> = {
      plans: ['SELECT'],
      tenants: ['SELECT'],
      subscriptions: ['SELECT'],
      tenant_settings: ['SELECT', 'UPDATE'],
      users: ['SELECT'],
      memberships: ['SELECT', 'UPDATE'],
      invitations: ['INSERT', 'SELECT', 'UPDATE'],
      platform_admins: [],
      audit_events: ['INSERT', 'SELECT'],
    };
    const rows = await getDbAdmin().execute<{ tbl: string; privilege: string }>(sql`
      select t.tbl, p.privilege
      from unnest(${`{${Object.keys(expected).join(',')}}`}::text[]) as t(tbl)
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) as p(privilege)
      where has_table_privilege('app_user', 'public.' || t.tbl, p.privilege)
      order by t.tbl, p.privilege`);

    const actual: Record<string, string[]> = Object.fromEntries(
      Object.keys(expected).map((t) => [t, [] as string[]]),
    );
    for (const row of rows) actual[row.tbl]?.push(row.privilege);
    expect(actual).toEqual(expected);
  });
});

describe('tablas de solo lectura: plans, tenants, subscriptions, users', () => {
  it('plans: insert, update y delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.insert(plans).values({ code: `x-${newId()}`, name: 'X', storageMb: 1 }),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(plans).set({ name: 'Hack' }).where(eq(plans.code, 'starter')),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.delete(plans).where(eq(plans.code, 'starter'))),
    );
  });

  it('tenants: insert, update y delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.insert(tenants).values({ name: 'X', slug: randomSlug() })),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(tenants).set({ name: 'Hack' }).where(eq(tenants.id, A)),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.delete(tenants).where(eq(tenants.id, A))),
    );
  });

  it('subscriptions: insert, update y delete → 42501', async () => {
    const [plan] = await getDbAdmin().select({ id: plans.id }).from(plans).limit(1);
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.insert(subscriptions).values({ tenantId: A, planId: plan?.id ?? newId() }),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx
          .update(subscriptions)
          .set({ status: 'active' })
          .where(eq(subscriptions.id, subscriptionA)),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.delete(subscriptions).where(eq(subscriptions.id, subscriptionA)),
      ),
    );
  });

  it('users: insert, update y delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.insert(users).values({ email: randomEmail(), fullName: 'X' })),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(users).set({ fullName: 'Hack' }).where(eq(users.id, U)),
      ),
    );
    await expectDenied(() => withTenant(scope(), (tx) => tx.delete(users).where(eq(users.id, U))));
  });

  it('las cuatro sí se pueden leer dentro de withTenant', async () => {
    const counts = await withTenant(scope(), async (tx) => ({
      plans: (await tx.select().from(plans)).length,
      tenants: (await tx.select().from(tenants)).length,
      subscriptions: (await tx.select().from(subscriptions)).length,
      users: (await tx.select().from(users)).length,
    }));

    expect(counts.plans).toBeGreaterThanOrEqual(3);
    expect(counts).toMatchObject({ tenants: 1, subscriptions: 1, users: 2 });
  });
});

describe('platform_admins: invisible para app_user', () => {
  it('select sin contexto → 42501', async () => {
    await expectDenied(() => getDb().execute(sql`select * from platform_admins`));
  });

  it('select dentro de withTenant → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.execute(sql`select * from platform_admins`)),
    );
  });

  it('insert de sí mismo como SuperAdmin → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.execute(sql`insert into platform_admins (user_id) values (${U})`),
      ),
    );
  });
});

describe('tenant_settings: actualizar sí, crear y borrar no', () => {
  it('update de su tenant afecta 1 fila', async () => {
    const updated = await withTenant(scope(), (tx) =>
      tx
        .update(tenantSettings)
        .set({ timezone: 'America/Lima' })
        .where(eq(tenantSettings.tenantId, A))
        .returning({ id: tenantSettings.tenantId }),
    );

    expect(updated).toEqual([{ id: A }]);
  });

  it('insert → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.insert(tenantSettings).values({ tenantId: A })),
    );
  });

  it('delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, A))),
    );
  });
});

describe('memberships: actualizar sí, crear y borrar no', () => {
  it('update de roles en su tenant afecta 1 fila', async () => {
    const updated = await withTenant(scope(), (tx) =>
      tx
        .update(memberships)
        .set({ roles: ['requester', 'approver'] })
        .where(eq(memberships.id, membershipOther))
        .returning({ id: memberships.id }),
    );

    expect(updated).toEqual([{ id: membershipOther }]);
  });

  it('insert → 42501', async () => {
    const extra = await fx.user();
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.insert(memberships).values({ tenantId: A, userId: extra.id, roles: ['requester'] }),
      ),
    );
  });

  it('delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.delete(memberships).where(eq(memberships.id, membershipOther)),
      ),
    );
  });
});

describe('invitations: crear y renovar sí, borrar no', () => {
  it('insert en su tenant funciona', async () => {
    const email = randomEmail();
    const inserted = await withTenant(scope(), (tx) =>
      tx
        .insert(invitations)
        .values({
          tenantId: A,
          email,
          roles: ['requester'],
          tokenHash: `hash-${newId()}`,
          expiresAt: FAR_FUTURE,
          invitedBy: U,
        })
        .returning({ email: invitations.email }),
    );

    expect(inserted).toEqual([{ email }]);
  });

  it('update en su tenant afecta 1 fila', async () => {
    const updated = await withTenant(scope(), (tx) =>
      tx
        .update(invitations)
        .set({ tokenHash: `renewed-${newId()}` })
        .where(eq(invitations.id, invitationA))
        .returning({ id: invitations.id }),
    );

    expect(updated).toEqual([{ id: invitationA }]);
  });

  it('delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.delete(invitations).where(eq(invitations.id, invitationA))),
    );
  });
});

describe('audit_events: solo insert y select', () => {
  it('insert en su tenant funciona y se puede leer', async () => {
    const rows = await withTenant(scope(), async (tx) => {
      await tx.insert(auditEvents).values({
        tenantId: A,
        actorUserId: U,
        actorType: 'user',
        action: 'grants.test',
        entityType: 'tenant',
        entityId: A,
      });
      return tx
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.action, 'grants.test'));
    });

    expect(rows).toEqual([{ action: 'grants.test' }]);
  });

  it('update → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(auditEvents).set({ action: 'tampered' }).where(eq(auditEvents.id, auditA)),
      ),
    );
  });

  it('delete → 42501', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.delete(auditEvents).where(eq(auditEvents.id, auditA))),
    );
  });

  it('insert con tenant_id null dentro de withTenant → 42501 (solo getDbAdmin escribe eventos de plataforma)', async () => {
    const error = await capturePgError(() =>
      withTenant(scope(), (tx) =>
        tx.insert(auditEvents).values({
          tenantId: null,
          actorType: 'platform_admin',
          action: 'grants.platform',
          entityType: 'tenant',
        }),
      ),
    );

    expect(error.code).toBe('42501');
    expect(error.message).toMatch(/row-level security/);
  });
});
