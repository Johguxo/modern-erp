// API pública del módulo identity: tenants, planes, usuarios, membresías y auditoría.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export { ROLE_PERMISSIONS, permissionsFor } from './domain/permissions';
export { PLAN_FEATURES, type PlanFeature } from './domain/plan-features';
export type { UserCapacity } from './domain/entitlements';
export type { Entitlements } from './application/entitlements';
export {
  createAuditLogFor,
  createEntitlementsFor,
  createInvitationServices,
  createSessionServices,
  createPlatformDeps,
  createPlatformStore,
  createSettingsDeps,
  createTenantCurrencyFor,
  createUserAdminDeps,
  type SettingsExtras,
  type PlatformExtras,
  type UserAdminExtras,
} from './infrastructure/deps';
export type { TenantSetupStepFactory } from './infrastructure/drizzle-platform-store';
export type { PlatformDeps, PlatformStore, TenantSetupStep } from './application/platform/ports';
export { createTenant } from './application/platform/create-tenant';
export { updateSubscription } from './application/platform/update-subscription';
export { inviteTenantAdmin } from './application/platform/invite-tenant-admin';
export {
  getTenant,
  listPlans,
  listTenants,
  type PlanOption,
  type TenantDetail,
  type TenantListItem,
  type TenantSubscriptionView,
} from './application/platform/queries';
export {
  bootstrapPlatformAdmin,
  BootstrapError,
  type BootstrapResult,
} from './application/platform/bootstrap-platform-admin';
export type { EntryDecision } from './domain/entry';
export type { SessionRepository, TenantAccess } from './application/session-ports';
export { signIn } from './application/sign-in';
export { requestPasswordReset } from './application/request-password-reset';
export { resetPassword } from './application/reset-password';
export { resolveEntry } from './application/resolve-entry';
export { resolveTenantSession } from './application/resolve-tenant-session';
export { resolveJobCtx } from './application/resolve-job-ctx';
export type { AuditLog, UserAdminDeps } from './application/user-admin-ports';
export { recordAudit, type AuditEvent } from './application/audit';
export {
  listMembers,
  type ListMembersOutput,
  type MemberListItem,
  type PendingInvitationItem,
} from './application/list-members';
export { inviteUser } from './application/invite-user';
export { resendInvitation } from './application/resend-invitation';
export { cancelInvitation } from './application/cancel-invitation';
export { updateMemberRoles } from './application/update-member-roles';
export { disableMember } from './application/disable-member';
export { reactivateMember } from './application/reactivate-member';
export {
  previewInvitation,
  type AcceptMode,
  type InvitationPreview,
} from './application/preview-invitation';
export {
  acceptInvitation,
  type AcceptInvitationDeps,
  type AcceptInvitationInput,
} from './application/accept-invitation';
export type { SettingsDeps } from './application/settings-ports';
export {
  getCompanyBrand,
  getCompanySettings,
  type CompanyBrandView,
  type CompanySettingsView,
} from './application/company-settings';
export { updateCompanySettings } from './application/update-company-settings';
export { removeCompanyLogo, uploadCompanyLogo } from './application/company-logo';
