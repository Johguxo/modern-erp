// Fábricas de dependencias del módulo (ADR-005): la entrega las arma con la transacción del
// request (o con getDbAdmin() en casos acotados) y se las pasa a los casos de uso.
import type { DbExecutor } from '@/db';
import { getDbAdmin } from '@/db/admin';

import { createEntitlements, type Entitlements } from '../application/entitlements';
import type { InvitationAcceptStore } from '../application/invitation-accept-ports';
import type { PlatformDeps, PlatformStore } from '../application/platform/ports';
import type { SessionRepository } from '../application/session-ports';
import type { UserAdminDeps } from '../application/user-admin-ports';

import { createDrizzleAuditLog } from './drizzle-audit-log';
import { createDrizzleEntitlementsRepository } from './drizzle-entitlements-repository';
import { createDrizzleInvitationAcceptStore } from './drizzle-invitation-accept-store';
import { createDrizzleInvitationRepository } from './drizzle-invitation-repository';
import { createDrizzleMemberRepository } from './drizzle-member-repository';
import { createDrizzlePlatformStore, type TenantSetupStepFactory } from './drizzle-platform-store';
import { createDrizzleSessionRepository } from './drizzle-session-repository';
import { createDrizzleTenantDirectory, createDrizzleTenantLocks } from './drizzle-tenant-store';

/** Entitlements sobre una conexión (transacción de withTenant o getDbAdmin()). */
export function createEntitlementsFor(db: DbExecutor): Entitlements {
  return createEntitlements({ repo: createDrizzleEntitlementsRepository(db) });
}

/**
 * Servicios de sesión (E1-H2): lecturas acotadas con la conexión dueño (ADR-004 §8), porque aún
 * no hay tenant activo para RLS. La entrega no recibe la conexión: solo estos servicios.
 */
export function createSessionServices(db: DbExecutor = getDbAdmin()): {
  sessions: SessionRepository;
  entitlements: Entitlements;
} {
  return {
    sessions: createDrizzleSessionRepository(db),
    entitlements: createEntitlementsFor(db),
  };
}

/** Lo que la entrega aporta a la gestión de usuarios (además de la transacción). */
export type UserAdminExtras = Pick<
  UserAdminDeps,
  'clock' | 'logger' | 'client' | 'afterCommit' | 'mailer' | 'appUrl'
>;

/**
 * Dependencias de la gestión de usuarios (E1-H3) sobre la transacción de withTenant: todos los
 * repositorios usan esa transacción (RLS del tenant activo) y filtran por tenantId.
 */
export function createUserAdminDeps(tx: DbExecutor, extras: UserAdminExtras): UserAdminDeps {
  return {
    members: createDrizzleMemberRepository(tx),
    invitations: createDrizzleInvitationRepository(tx),
    locks: createDrizzleTenantLocks(tx),
    tenants: createDrizzleTenantDirectory(tx),
    audit: createDrizzleAuditLog(tx),
    entitlements: createEntitlementsFor(tx),
    ...extras,
  };
}

/**
 * Aceptar invitación (E1-H3): conexión dueño acotada por token_hash y auditada (ADR-004 §8),
 * porque el invitado aún no tiene tenant activo. La entrega solo recibe el store.
 */
export function createInvitationServices(db: DbExecutor = getDbAdmin()): {
  store: InvitationAcceptStore;
} {
  return { store: createDrizzleInvitationAcceptStore(db) };
}

/**
 * Consola de plataforma (E1-H4, ADR-007): store sobre la conexión dueño. La entrega nunca recibe
 * la conexión; solo el store, cuyos casos de uso revisan SuperAdmin y auditan cada escritura.
 */
export function createPlatformStore(
  setupSteps: readonly TenantSetupStepFactory[] = [],
  db: DbExecutor = getDbAdmin(),
): PlatformStore {
  return createDrizzlePlatformStore(db, setupSteps);
}

/** Lo que la entrega aporta a la consola (además de los pasos de alta). */
export type PlatformExtras = Omit<PlatformDeps, 'store'>;

export function createPlatformDeps(
  extras: PlatformExtras,
  setupSteps: readonly TenantSetupStepFactory[] = [],
): PlatformDeps {
  return { store: createPlatformStore(setupSteps), ...extras };
}
