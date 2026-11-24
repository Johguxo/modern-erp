// Reglas de gestión de miembros (E1-H3). "Admin" se mide por permiso (`users.manage`), nunca por
// el nombre del rol (ADR-002): ningún cambio puede dejar a la empresa sin quien gestione usuarios.
import type { Role } from '@/shared/permissions';

import { permissionsFor } from './permissions';

export interface MemberSnapshot {
  readonly membershipId: string;
  readonly roles: readonly Role[];
  /** Membresía y usuario activos. */
  readonly active: boolean;
}

export interface MemberChange {
  readonly membershipId: string;
  readonly roles?: readonly Role[];
  readonly active?: boolean;
}

export function canManageUsers(roles: readonly Role[]): boolean {
  return permissionsFor(roles).has('users.manage');
}

/** true si, tras el cambio, queda al menos un miembro activo que puede gestionar usuarios. */
export function keepsAUserManager(
  members: readonly MemberSnapshot[],
  change: MemberChange,
): boolean {
  return members.some((member) => {
    const changed = member.membershipId === change.membershipId;
    const active = changed && change.active !== undefined ? change.active : member.active;
    const roles = changed && change.roles !== undefined ? change.roles : member.roles;
    return active && canManageUsers(roles);
  });
}

/** Nadie puede desactivar su propia membresía (se quedaría fuera sin poder volver). */
export function isSelf(actorUserId: string, targetUserId: string): boolean {
  return actorUserId === targetUserId;
}
