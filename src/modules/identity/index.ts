// API pública del módulo identity: tenants, planes, usuarios, membresías y auditoría.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export { ROLE_PERMISSIONS, permissionsFor } from './domain/permissions';
export { PLAN_FEATURES, type PlanFeature } from './domain/plan-features';
export type { UserCapacity } from './domain/entitlements';
export type { Entitlements } from './application/entitlements';
export { createEntitlementsFor, createSessionServices } from './infrastructure/deps';
export type { EntryDecision } from './domain/entry';
export type { SessionRepository, TenantAccess } from './application/session-ports';
export { signIn } from './application/sign-in';
export { requestPasswordReset } from './application/request-password-reset';
export { resetPassword } from './application/reset-password';
export { resolveEntry } from './application/resolve-entry';
export { resolveTenantSession } from './application/resolve-tenant-session';
