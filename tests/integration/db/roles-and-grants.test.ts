// E0-H2 · Migración inicial: extensiones (pgcrypto, pg_trgm), rol app_user y sus permisos.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';

import { dropTable, expectPgError, probeTableName } from '../helpers/db';

const created: string[] = [];

afterAll(async () => {
  for (const name of created) await dropTable(name);
  await closeDatabases();
});

describe('migración inicial: extensiones y rol app_user', () => {
  it('instala las extensiones pgcrypto y pg_trgm', async () => {
    const rows = await getDbAdmin().execute<{ extname: string }>(
      sql`select extname from pg_extension where extname in ('pgcrypto', 'pg_trgm') order by extname`,
    );

    expect(rows.map((r) => r.extname)).toEqual(['pg_trgm', 'pgcrypto']);
  });

  it('crea el rol app_user sin bypassrls', async () => {
    const rows = await getDbAdmin().execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = 'app_user'`,
    );

    expect(rows).toEqual([{ rolbypassrls: false, rolsuper: false }]);
  });

  it('app_user no puede crear tablas en public (42501)', async () => {
    const name = probeTableName('_ddl_probe');
    created.push(name);

    const code = await expectPgError(() =>
      getDb().execute(sql`create table public.${sql.identifier(name)} (id int)`),
    );

    expect(code).toBe('42501');
  });

  it('una tabla nueva de public da a app_user select/insert/update/delete sin grant explícito y nada a anon/authenticated', async () => {
    const name = probeTableName('_grants_probe');
    created.push(name);
    await getDbAdmin().execute(sql`create table public.${sql.identifier(name)} (id int)`);

    const rows = await getDbAdmin().execute<{ role: string; privilege: string; granted: boolean }>(
      sql`select r.role, p.privilege,
                 has_table_privilege(r.role, ${`public.${name}`}, p.privilege) as granted
          from unnest(array['app_user', 'anon', 'authenticated']) as r(role)
          cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(privilege)
          order by r.role, p.privilege`,
    );

    const granted = (role: string) =>
      rows.filter((r) => r.role === role && r.granted).map((r) => r.privilege);
    expect(granted('app_user')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect(granted('anon')).toEqual([]);
    expect(granted('authenticated')).toEqual([]);
  });
});
