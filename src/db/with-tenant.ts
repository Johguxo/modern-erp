// Contexto de base de datos por transacción (ADR-004).
// withTenant fija app.tenant_id y app.user_id; withUser solo app.user_id (antes de elegir empresa).
// Los valores van como parámetros (nunca interpolados) y `set_config(..., true)` los limita a la
// transacción, así no se filtran a otra petición que reutilice la conexión del pool.
import { sql, type SQL } from 'drizzle-orm';

import { getDb, type AppDatabase, type DbTransaction } from './client';

/** Lo mínimo del ctx que necesita la base. El Ctx completo (E0-H3) lo satisface. */
export interface TenantScope {
  readonly tenantId: string;
  readonly userId: string;
}

export interface UserScope {
  readonly userId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(name: string, value: string): void {
  if (!UUID.test(value)) {
    // Error de programación (el ctx siempre trae UUIDs), no un error de dominio.
    throw new Error(`${name} debe ser un UUID.`);
  }
}

export function tenantSettingsQuery(scope: TenantScope): SQL {
  assertUuid('tenantId', scope.tenantId);
  assertUuid('userId', scope.userId);
  return sql`select set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', ${scope.userId}, true)`;
}

export function userSettingsQuery(scope: UserScope): SQL {
  assertUuid('userId', scope.userId);
  return sql`select set_config('app.user_id', ${scope.userId}, true)`;
}

/** Igual que withTenant, sobre una conexión dada (pruebas). */
export async function runWithTenant<T>(
  database: AppDatabase,
  scope: TenantScope,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const settings = tenantSettingsQuery(scope);
  return database.transaction(async (tx) => {
    await tx.execute(settings);
    return fn(tx);
  });
}

/** Igual que withUser, sobre una conexión dada (pruebas). */
export async function runWithUser<T>(
  database: AppDatabase,
  scope: UserScope,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const settings = userSettingsQuery(scope);
  return database.transaction(async (tx) => {
    await tx.execute(settings);
    return fn(tx);
  });
}

/**
 * Abre una transacción con el rol app_user y el tenant del ctx. Los repositorios usan `tx` y
 * además filtran por ctx.tenantId (primera defensa). No se anida.
 */
export function withTenant<T>(ctx: TenantScope, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return runWithTenant(getDb(), ctx, fn);
}

/** Transacción con solo el usuario fijado: flujos previos a elegir empresa. */
export function withUser<T>(ctx: UserScope, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return runWithUser(getDb(), ctx, fn);
}
