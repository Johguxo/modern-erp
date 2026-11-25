// Fábricas de dependencias del módulo (ADR-005): la entrega las arma con la transacción del
// request (o con getDbAdmin() en casos acotados) y se las pasa a los casos de uso.
import type { DbExecutor } from '@/db';
import { getDbAdmin } from '@/db/admin';

import { createEntitlements, type Entitlements } from '../application/entitlements';
import type { InvitationAcceptStore } from '../application/invitation-accept-ports';
import type { PlatformDeps, PlatformGuard, PlatformStore } from '../application/platform/ports';
import type { SessionRepository } from '../application/session-ports';
import type { SettingsDeps } from '../application/settings-ports';
import type { AuditLog, UserAdminDeps } from '../application/user-admin-ports';

import { createDrizzleAuditLog } from './drizzle-audit-log';
import { createDrizzleEntitlementsRepository } from './drizzle-entitlements-repository';
import { createDrizzleInvitationAcceptStore } from './drizzle-invitation-accept-store';
import { createDrizzleInvitationRepository } from './drizzle-invitation-repository';
import { createDrizzleMemberRepository } from './drizzle-member-repository';
import { createDrizzlePlatformGuard } from './drizzle-platform-guard';
import { createDrizzlePlatformStore, type TenantSetupStepFactory } from './drizzle-platform-store';
import { createDrizzleSessionRepository } from './drizzle-session-repository';
import { createDrizzleSettingsRepository } from './drizzle-settings-repository';
import { createDrizzleTenantDirectory, createDrizzleTenantLocks } from './drizzle-tenant-store';

/** Auditoría sobre una conexión (transacción de withTenant): solo insert, con RLS del tenant activo. */
export function createAuditLogFor(db: DbExecutor): AuditLog {
  return createDrizzleAuditLog(db);
}

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

/**
 * Revisión de SuperAdmin sobre la conexión de otro módulo (p. ej. la transacción dueño de la
 * secuencia de numeración, E3-H1): para repetir `assertPlatformAdmin` antes de escribir.
 */
export function createPlatformGuardFor(db: DbExecutor): PlatformGuard {
  return createDrizzlePlatformGuard(db);
}

/** Lo que la entrega aporta a la consola (además de los pasos de alta). */
export type PlatformExtras = Omit<PlatformDeps, 'store'>;

export function createPlatformDeps(
  extras: PlatformExtras,
  setupSteps: readonly TenantSetupStepFactory[] = [],
): PlatformDeps {
  return { store: createPlatformStore(setupSteps), ...extras };
}

/** Lo que la entrega aporta a la configuración de la empresa (además de la transacción). */
export type SettingsExtras = Omit<SettingsDeps, 'settings' | 'audit'>;

/**
 * Configuración de la empresa (E1-H5) sobre la transacción de withTenant: RLS de tenant_settings
 * y filtro por tenantId.
 */
export function createSettingsDeps(tx: DbExecutor, extras: SettingsExtras): SettingsDeps {
  return {
    settings: createDrizzleSettingsRepository(tx),
    audit: createDrizzleAuditLog(tx),
    ...extras,
  };
}

/**
 * Moneda del tenant (tenant_settings.currency) sobre la transacción de withTenant. La usan los
 * módulos que necesitan una moneda por defecto (importación del catálogo, E2-H3); si falta la fila
 * de ajustes devuelve PEN, el valor por defecto de la base.
 */
export function createTenantCurrencyFor(
  db: DbExecutor,
): (tenantId: string) => Promise<'PEN' | 'USD'> {
  const settings = createDrizzleSettingsRepository(db);
  return async (tenantId) => (await settings.get(tenantId))?.currency ?? 'PEN';
}
