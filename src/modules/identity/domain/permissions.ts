// Mapa fijo rol → permisos (ADR-002 §2). Los casos de uso revisan permisos, nunca roles.
// Roles personalizados (pospuesto): este mapa sería la plantilla de las tablas roles/role_permissions.
import { PERMISSIONS, type Permission, type Role } from '@/shared/permissions';

const ADMIN: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS = {
  admin: ADMIN,
  requester: ['requests.create', 'requests.read_own'],
  warehouse: [
    'requests.create',
    'requests.read_own',
    'requests.read_all',
    'requests.correct_line',
    'requests.deliver',
    'approvals.decide',
    'catalog.manage',
    'inventory.manage',
  ],
  approver: ['requests.read_own', 'requests.read_all', 'approvals.decide'],
  /** Fase 2: cotizaciones y órdenes de compra. */
  purchasing: [],
} as const satisfies Record<Role, readonly Permission[]>;

/** Unión de los permisos de los roles (sin duplicados). */
export function permissionsFor(roles: readonly Role[]): ReadonlySet<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}
