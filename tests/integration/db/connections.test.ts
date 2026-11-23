// E0-H2 · Drizzle configurado con dos conexiones: `db` (app_user) y `dbAdmin` (rol dueño).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';

afterAll(async () => {
  await closeDatabases();
});

describe('Drizzle con dos conexiones: db (app_user) y dbAdmin (rol dueño)', () => {
  it('db conecta como app_user, sin bypassrls y sin superusuario', async () => {
    const rows = await getDb().execute<{
      current_user: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(sql`select current_user, r.rolbypassrls, r.rolsuper
           from pg_roles r where r.rolname = current_user`);

    expect(rows).toEqual([{ current_user: 'app_user', rolbypassrls: false, rolsuper: false }]);
  });

  it('dbAdmin conecta como el rol dueño (postgres)', async () => {
    const rows = await getDbAdmin().execute<{ current_user: string }>(sql`select current_user`);

    expect(rows).toEqual([{ current_user: 'postgres' }]);
  });

  it('getDb devuelve la misma instancia (singleton por proceso)', () => {
    expect(getDb()).toBe(getDb());
    expect(getDbAdmin()).toBe(getDbAdmin());
  });
});
