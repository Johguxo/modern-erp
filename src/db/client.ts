// Conexión de la app web con el rol app_user (sujeto a RLS). Ver ADR-004.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getEnv } from '../env';

import * as schema from './schema';

export type Schema = typeof schema;
export type AppDatabase = PostgresJsDatabase<Schema> & { $client: postgres.Sql };
export type DbTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
/** La base o una transacción: los repositorios aceptan cualquiera de las dos. */
export type DbExecutor = AppDatabase | DbTransaction;

export interface DatabaseOptions {
  /** Nombre visible en pg_stat_activity. */
  applicationName: string;
  /** Conexiones máximas del pool. */
  max?: number;
}

export function createDatabase(url: string, { applicationName, max = 10 }: DatabaseOptions) {
  const client = postgres(url, {
    // Obligatorio con el pooler de Supabase en modo transacción; en local no cuesta nada.
    prepare: false,
    max,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { application_name: applicationName },
  });
  return drizzle({ client, schema, casing: 'snake_case' });
}

function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error('La base de datos solo se usa en el servidor.');
  }
}

// En desarrollo Next recarga módulos: el singleton en globalThis evita abrir un pool por recarga.
const globalForDb = globalThis as typeof globalThis & { __linkusDb?: AppDatabase };

/** Conexión `db` (rol app_user). Perezosa: `next build` compila sin .env.local. */
export function getDb(): AppDatabase {
  assertServer();
  globalForDb.__linkusDb ??= createDatabase(getEnv().DATABASE_URL, {
    applicationName: 'linkus-web',
  });
  return globalForDb.__linkusDb;
}

/** Cierra la conexión `db` si se abrió (pruebas y apagado del proceso). */
export async function closeDb(): Promise<void> {
  const database = globalForDb.__linkusDb;
  globalForDb.__linkusDb = undefined;
  await database?.$client.end({ timeout: 5 });
}
