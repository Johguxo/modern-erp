// Vocabulario de roles y permisos (ADR-002). Vive en shared porque Ctx lo necesita y shared no
// puede depender de un módulo. El mapa rol → permisos (ROLE_PERMISSIONS) vive en
// src/modules/identity/domain/permissions.ts.

export const TENANT_ROLES = ['admin', 'requester', 'warehouse', 'approver', 'purchasing'] as const;
export type Role = (typeof TENANT_ROLES)[number];

export const PERMISSIONS = [
  'requests.create',
  'requests.read_own',
  'requests.read_all',
  'requests.correct_line',
  'requests.deliver',
  'requests.cancel_any',
  'approvals.decide',
  'catalog.manage',
  'inventory.manage',
  'users.manage',
  'settings.manage',
  'approval_policies.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
