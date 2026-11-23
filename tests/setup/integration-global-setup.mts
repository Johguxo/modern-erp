// Global setup de las pruebas de integración (E0-H2): comprueba que Supabase local esté arriba,
// que la migración inicial esté aplicada y que app_user tenga login, con mensajes accionables.
import postgres from 'postgres';

import { TEST_ENV } from './test-env.mts';

const NOT_RUNNING =
  'No se pudo conectar a Postgres local (127.0.0.1:54322). Levanta Supabase con `pnpm exec supabase start` y aplica `pnpm db:migrate`.';
const MISSING_MIGRATION = 'Falta la migración inicial: ejecuta `pnpm db:migrate`.';
const NO_LOGIN = 'app_user no tiene login local: ejecuta `pnpm db:reset`.';

const AUTH_FAILED = new Set(['28P01', '28000']);

function connect(url: string) {
  return postgres(url, { max: 1, connect_timeout: 5, onnotice: () => undefined, prepare: false });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}

async function checkAdmin(url: string): Promise<void> {
  const sql = connect(url);
  try {
    let rows: { has_role: boolean; has_fn: boolean }[];
    try {
      rows = await sql<{ has_role: boolean; has_fn: boolean }[]>`
        select exists (select 1 from pg_roles where rolname = 'app_user') as has_role,
               to_regprocedure('app.current_tenant_id()') is not null as has_fn`;
    } catch (error) {
      throw new Error(NOT_RUNNING, { cause: error });
    }
    const [row] = rows;
    if (!row?.has_role || !row.has_fn) throw new Error(MISSING_MIGRATION);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function checkAppUser(url: string): Promise<void> {
  const sql = connect(url);
  try {
    await sql`select 1`;
  } catch (error) {
    if (AUTH_FAILED.has(errorCode(error) ?? '')) throw new Error(NO_LOGIN, { cause: error });
    throw new Error(NOT_RUNNING, { cause: error });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function setup(): Promise<void> {
  await checkAdmin(process.env.DATABASE_URL_ADMIN ?? TEST_ENV.DATABASE_URL_ADMIN);
  await checkAppUser(process.env.DATABASE_URL ?? TEST_ENV.DATABASE_URL);
}
