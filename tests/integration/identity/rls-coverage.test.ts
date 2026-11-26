// E1-H1 · Guarda para todas las épicas: toda tabla de public tiene RLS y toda política es para
// app_user (ADR-004 §5 y §11). Una tabla nueva sin RLS o con una política para otro rol rompe aquí.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';

afterAll(async () => {
  await closeDatabases();
});

// Las tablas sonda de otras pruebas de integración (`_rls_probe_*`, `_grants_probe_*`, ...) empiezan
// con "_" y contienen "probe"; viven solo mientras corre su archivo y se excluyen para no depender
// del orden. Convención: toda tabla temporal de pruebas se llama `_<algo>_probe_<sufijo>`.
const NOT_PROBE = sql`c.relname not like '\\_%probe%'`;

describe('cobertura de RLS en public', () => {
  it('toda tabla de public tiene row level security activo', async () => {
    const rows = await getDbAdmin().execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and ${NOT_PROBE}
      order by c.relname`);

    expect(rows.length).toBeGreaterThanOrEqual(14);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('incluye las 9 tablas de identity', async () => {
    const rows = await getDbAdmin().execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);

    expect(rows.map((r) => r.relname)).toEqual(
      expect.arrayContaining([
        'plans',
        'tenants',
        'subscriptions',
        'tenant_settings',
        'users',
        'memberships',
        'invitations',
        'platform_admins',
        'audit_events',
      ]),
    );
  });

  it('toda política de public es solo para app_user', async () => {
    const rows = await getDbAdmin().execute<{
      tablename: string;
      policyname: string;
      roles: string;
    }>(sql`
      select tablename, policyname, roles::text as roles
      from pg_policies
      where schemaname = 'public' and tablename not like '\\_%probe%'`);

    expect(rows.length).toBeGreaterThan(0);
    const offenders = rows.filter((r) => r.roles !== '{app_user}');
    expect(offenders).toEqual([]);
  });
});

describe('cobertura de RLS en catalog (E2-H1)', () => {
  it('las 5 tablas del catálogo tienen RLS y una política tenant_isolation para app_user', async () => {
    const tables = ['warehouses', 'products', 'equipment', 'cost_centers', 'import_jobs'];
    const rows = await getDbAdmin().execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and policyname = 'tenant_isolation'`);
    const rls = await getDbAdmin().execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);

    for (const table of tables) {
      expect(rows.map((r) => r.tablename)).toContain(table);
      expect(rls.find((r) => r.relname === table)?.relrowsecurity).toBe(true);
    }
  });
});

describe('cobertura de RLS en approvals (E4-H1)', () => {
  it('las tablas de políticas tienen RLS y una política tenant_isolation para app_user', async () => {
    const tables = ['approval_policies', 'approval_policy_steps'];
    const rows = await getDbAdmin().execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and policyname = 'tenant_isolation'`);
    const rls = await getDbAdmin().execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);

    for (const table of tables) {
      expect(rows.map((r) => r.tablename)).toContain(table);
      expect(rls.find((r) => r.relname === table)?.relrowsecurity).toBe(true);
    }
  });
});
