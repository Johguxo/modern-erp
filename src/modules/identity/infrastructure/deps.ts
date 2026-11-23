// Fábricas de dependencias del módulo (ADR-005): la entrega las arma con la transacción del
// request (o con getDbAdmin() en casos acotados) y se las pasa a los casos de uso.
import type { DbExecutor } from '@/db';

import { createEntitlements, type Entitlements } from '../application/entitlements';

import { createDrizzleEntitlementsRepository } from './drizzle-entitlements-repository';

/** Entitlements sobre una conexión (transacción de withTenant o getDbAdmin()). */
export function createEntitlementsFor(db: DbExecutor): Entitlements {
  return createEntitlements({ repo: createDrizzleEntitlementsRepository(db) });
}
