// Conexión con el rol dueño (sin RLS): migraciones, worker y casos de uso acotados y auditados.
// Nunca desde src/app directamente (regla de imports). Ver ADR-004.
import { getEnv } from '../env';

import { closeDb, createDatabase, type AppDatabase } from './client';

const globalForDb = globalThis as typeof globalThis & { __linkusDbAdmin?: AppDatabase };

/** Conexión `dbAdmin` (rol dueño). Perezosa y única por proceso. */
export function getDbAdmin(): AppDatabase {
  if (typeof window !== 'undefined') {
    throw new Error('La base de datos solo se usa en el servidor.');
  }
  globalForDb.__linkusDbAdmin ??= createDatabase(getEnv().DATABASE_URL_ADMIN, {
    applicationName: 'linkus-admin',
    max: 5,
  });
  return globalForDb.__linkusDbAdmin;
}

/** Cierra las dos conexiones si se abrieron (apagado del worker y pruebas). */
export async function closeDatabases(): Promise<void> {
  const admin = globalForDb.__linkusDbAdmin;
  globalForDb.__linkusDbAdmin = undefined;
  await Promise.all([closeDb(), admin?.$client.end({ timeout: 5 })]);
}
