// Utilidades de integración: tabla sonda con RLS por tenant y clientes dedicados.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { getDbAdmin } from '@/db/admin';
import { createDatabase, type AppDatabase } from '@/db/client';
import { pgErrorCode } from '@/db/errors';
import { getEnv } from '@/env';

export const newId = (): string => randomUUID();

/** Nombre único por ejecución: las pruebas no dependen del orden ni de restos de otras corridas. */
export function probeTableName(prefix = '_rls_probe'): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/** Crea public.<name> (tenant_id, label) con RLS y la política tenant_isolation para app_user. */
export async function createRlsProbeTable(name: string): Promise<void> {
  const table = sql.identifier(name);
  const admin = getDbAdmin();
  await admin.execute(
    sql`create table public.${table} (tenant_id uuid not null, label text not null)`,
  );
  await admin.execute(sql`alter table public.${table} enable row level security`);
  await admin.execute(sql`
    create policy tenant_isolation on public.${table} for all to app_user
      using (tenant_id = (select app.current_tenant_id()))
      with check (tenant_id = (select app.current_tenant_id()))`);
}

export async function dropTable(name: string): Promise<void> {
  await getDbAdmin().execute(sql`drop table if exists public.${sql.identifier(name)}`);
}

/** Cliente app_user con una sola conexión: permite comprobar qué queda en ella entre consultas. */
export function createSingleConnectionAppDb(): AppDatabase {
  return createDatabase(getEnv().DATABASE_URL, { applicationName: 'linkus-test', max: 1 });
}

/** Ejecuta fn y devuelve el SQLSTATE con que falló; falla la prueba si no lanza. */
export async function expectPgError(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (error) {
    return pgErrorCode(error);
  }
  throw new Error('Se esperaba un error de Postgres y la consulta pasó.');
}

export { pgErrorCode };
