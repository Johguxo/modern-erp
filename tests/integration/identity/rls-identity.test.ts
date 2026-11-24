// E1-H1 · RLS de las tablas de identity con dos tenants (A y B).
// U tiene membresía en A y en B; onlyA solo en A; onlyB solo en B.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb, type AppDatabase } from '@/db/client';
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
import { runWithTenant, withTenant, withUser } from '@/db/with-tenant';

import { createSingleConnectionAppDb } from '../helpers/db';
import { capturePgError, createIdentityFixtures, FAR_FUTURE } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let single: AppDatabase;

let A: string;
let B: string;
let U: string;
let onlyA: string;
let onlyB: string;
let membershipUA: string;
let membershipUB: string;
let membershipOnlyB: string;
const ids = { A: {} as Record<string, string>, B: {} as Record<string, string> };

/** Tablas con tenant_id y su columna, para recorrerlas igual. */
const TENANT_TABLES = [
  { name: 'subscriptions', table: subscriptions, column: subscriptions.tenantId },
  { name: 'tenant_settings', table: tenantSettings, column: tenantSettings.tenantId },
  { name: 'memberships', table: memberships, column: memberships.tenantId },
  { name: 'invitations', table: invitations, column: invitations.tenantId },
  { name: 'audit_events', table: auditEvents, column: auditEvents.tenantId },
] as const;

beforeAll(async () => {
  single = createSingleConnectionAppDb();
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  U = (await fx.user()).id;
  onlyA = (await fx.user()).id;
  onlyB = (await fx.user()).id;
  // Usuario sin membresías: nunca debe verse dentro de un tenant.
  await fx.user();

  membershipUA = (await fx.membership(A, U, { roles: ['admin'] })).id;
  membershipUB = (await fx.membership(B, U, { roles: ['requester'] })).id;
  await fx.membership(A, onlyA);
  membershipOnlyB = (await fx.membership(B, onlyB)).id;

  for (const [key, tenantId] of [
    ['A', A],
    ['B', B],
  ] as const) {
    await fx.subscription(tenantId, 'starter');
    await fx.settings(tenantId);
    ids[key].invitation = (await fx.invitation(tenantId)).id;
    ids[key].audit = (await fx.auditEvent(tenantId)).id;
  }
});

afterAll(async () => {
  await single?.$client.end({ timeout: 5 });
  await fx.cleanup();
  await closeDatabases();
});

describe('app_user sin contexto no ve filas de identity', () => {
  it.each(['tenants', 'users', ...TENANT_TABLES.map((t) => t.name)])(
    '%s: 0 filas sin withTenant ni withUser',
    async (name) => {
      const rows = await getDb().execute(sql`select 1 from ${sql.identifier(name)}`);

      expect(rows).toHaveLength(0);
    },
  );

  it('las filas existen (con getDbAdmin) aunque app_user no las vea', async () => {
    const rows = await getDbAdmin().select().from(memberships).where(eq(memberships.tenantId, A));

    expect(rows).toHaveLength(2);
  });

  it('plans: visibles para app_user incluso sin contexto', async () => {
    const rows = await getDb().select({ code: plans.code }).from(plans);

    expect(rows.map((r) => r.code)).toEqual(
      expect.arrayContaining(['starter', 'business', 'enterprise']),
    );
  });
});

describe('aislamiento entre dos tenants con withTenant', () => {
  it('tenants: withTenant(A) ve solo A', async () => {
    const rows = await withTenant({ tenantId: A, userId: U }, (tx) =>
      tx.select({ id: tenants.id }).from(tenants),
    );

    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it.each(TENANT_TABLES.map((t) => [t.name, t] as const))(
    '%s: withTenant(A) ve filas de A y ninguna de B',
    async (_name, { table, column }) => {
      const rows = await runWithTenant(single, { tenantId: A, userId: U }, (tx) =>
        tx.select({ tenantId: column }).from(table),
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([A]));
    },
  );

  it.each(TENANT_TABLES.map((t) => [t.name, t] as const))(
    '%s: withTenant(B) ve filas de B y ninguna de A',
    async (_name, { table, column }) => {
      const rows = await withTenant({ tenantId: B, userId: U }, (tx) =>
        tx.select({ tenantId: column }).from(table),
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([B]));
    },
  );

  it('invitations y audit_events: withTenant(A) ve las de A y no las de B', async () => {
    const [inv, audit] = await withTenant({ tenantId: A, userId: U }, async (tx) => [
      await tx.select({ id: invitations.id }).from(invitations),
      await tx.select({ id: auditEvents.id }).from(auditEvents),
    ]);

    expect(inv.map((r) => r.id)).toContain(ids.A.invitation);
    expect(inv.map((r) => r.id)).not.toContain(ids.B.invitation);
    expect(audit.map((r) => r.id)).toContain(ids.A.audit);
    expect(audit.map((r) => r.id)).not.toContain(ids.B.audit);
  });

  it('users: withTenant(A) ve a los compañeros de A y no a los solo-B ni a los sin membresía', async () => {
    const rows = await withTenant({ tenantId: A, userId: U }, (tx) =>
      tx.select({ id: users.id }).from(users),
    );

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([U, onlyA]));
  });

  it('users: withTenant(B) ve a U y a onlyB, no a onlyA', async () => {
    const rows = await withTenant({ tenantId: B, userId: onlyB }, (tx) =>
      tx.select({ id: users.id }).from(users),
    );

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([U, onlyB]));
  });
});

describe('withUser (antes de elegir empresa): solo lo propio', () => {
  it('users: ve solo su propia fila', async () => {
    const rows = await withUser({ userId: U }, (tx) => tx.select({ id: users.id }).from(users));

    expect(rows.map((r) => r.id)).toEqual([U]);
  });

  it('memberships: ve sus membresías de A y de B y ninguna ajena', async () => {
    const rows = await withUser({ userId: U }, (tx) =>
      tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships),
    );

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([membershipUA, membershipUB]));
  });

  it('tenants: ve A y B, las empresas donde tiene membresía activa', async () => {
    const rows = await withUser({ userId: U }, (tx) => tx.select({ id: tenants.id }).from(tenants));

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([A, B]));
  });

  it('tenants: onlyA ve solo A', async () => {
    const rows = await withUser({ userId: onlyA }, (tx) =>
      tx.select({ id: tenants.id }).from(tenants),
    );

    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it.each(
    TENANT_TABLES.filter((t) => t.name !== 'memberships').map((t) => [t.name, t.table] as const),
  )('%s: 0 filas con solo withUser', async (_name, table) => {
    const rows = await withUser({ userId: U }, (tx) => tx.select().from(table));

    expect(rows).toHaveLength(0);
  });

  it('dentro de withTenant(A), U ya no ve el tenant B ni su membresía de B', async () => {
    const { tenantRows, membershipRows } = await withTenant(
      { tenantId: A, userId: U },
      async (tx) => ({
        tenantRows: await tx.select({ id: tenants.id }).from(tenants),
        membershipRows: await tx.select({ id: memberships.id }).from(memberships),
      }),
    );

    expect(tenantRows.map((r) => r.id)).toEqual([A]);
    expect(membershipRows.map((r) => r.id)).toContain(membershipUA);
    expect(membershipRows.map((r) => r.id)).not.toContain(membershipUB);
  });
});

describe('no se escriben datos de B desde withTenant(A)', () => {
  it('insert de invitación con tenant B → 42501 (row-level security)', async () => {
    const error = await capturePgError(() =>
      withTenant({ tenantId: A, userId: U }, (tx) =>
        tx.insert(invitations).values({
          tenantId: B,
          email: 'intruso-inv@test.linkus.pe',
          roles: ['requester'],
          tokenHash: `intruso-${A}`,
          expiresAt: FAR_FUTURE,
        }),
      ),
    );

    expect(error.code).toBe('42501');
    expect(error.message).toMatch(/row-level security/);
    const leaked = await getDbAdmin()
      .select()
      .from(invitations)
      .where(eq(invitations.email, 'intruso-inv@test.linkus.pe'));
    expect(leaked).toHaveLength(0);
  });

  it('insert de audit_event con tenant B → 42501 (row-level security)', async () => {
    const error = await capturePgError(() =>
      withTenant({ tenantId: A, userId: U }, (tx) =>
        tx.insert(auditEvents).values({
          tenantId: B,
          actorType: 'user',
          action: 'test.intruso',
          entityType: 'tenant',
        }),
      ),
    );

    expect(error.code).toBe('42501');
    expect(error.message).toMatch(/row-level security/);
  });

  it('update de una membresía de B afecta 0 filas y no la cambia', async () => {
    const updated = await withTenant({ tenantId: A, userId: U }, (tx) =>
      tx
        .update(memberships)
        .set({ status: 'disabled' })
        .where(eq(memberships.id, membershipOnlyB))
        .returning({ id: memberships.id }),
    );

    expect(updated).toHaveLength(0);
    const [row] = await getDbAdmin()
      .select({ status: memberships.status })
      .from(memberships)
      .where(eq(memberships.id, membershipOnlyB));
    expect(row?.status).toBe('active');
  });

  it('update de tenant_settings de B afecta 0 filas', async () => {
    const updated = await withTenant({ tenantId: A, userId: U }, (tx) =>
      tx
        .update(tenantSettings)
        .set({ timezone: 'UTC' })
        .where(eq(tenantSettings.tenantId, B))
        .returning({ id: tenantSettings.tenantId }),
    );

    expect(updated).toHaveLength(0);
  });

  it('mover una membresía de A al tenant B → 42501 (with check)', async () => {
    const error = await capturePgError(() =>
      withTenant({ tenantId: A, userId: U }, (tx) =>
        tx.update(memberships).set({ tenantId: B }).where(eq(memberships.id, membershipUA)),
      ),
    );

    expect(error.code).toBe('42501');
  });

  it('el contexto no se filtra: tras withTenant(A) la misma conexión vuelve a ver 0 filas', async () => {
    await runWithTenant(single, { tenantId: A, userId: U }, (tx) => tx.select().from(memberships));

    const rows = await single.execute(sql`select 1 from memberships`);
    expect(rows).toHaveLength(0);
  });
});
