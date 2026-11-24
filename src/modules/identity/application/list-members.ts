// Miembros e invitaciones pendientes de la empresa (E1-H3, /configuracion/usuarios), con el uso
// del cupo para el encabezado. Lectura: también en solo lectura.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import type { Role } from '@/shared/permissions';

import type { MemberStatus, UserAdminDeps } from './user-admin-ports';

export interface MemberListItem {
  readonly membershipId: string;
  readonly fullName: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly status: MemberStatus;
  /** Estado de la membresía en esta empresa (desactivar/reactivar). */
  readonly membershipStatus: MemberStatus;
  readonly isSelf: boolean;
}

export interface PendingInvitationItem {
  readonly invitationId: string;
  readonly email: string;
  readonly roles: readonly Role[];
  /** ISO (UTC); la UI lo muestra con la zona del tenant. */
  readonly expiresAt: string;
  readonly invitedByName: string | null;
}

export interface ListMembersOutput {
  readonly members: readonly MemberListItem[];
  readonly invitations: readonly PendingInvitationItem[];
  readonly seats: { readonly used: number; readonly limit: number | null };
}

export async function listMembers(
  ctx: Ctx,
  deps: Pick<UserAdminDeps, 'members' | 'invitations' | 'entitlements' | 'clock'>,
): Promise<ListMembersOutput> {
  requirePermission(ctx, 'users.manage');
  const [members, invitations, capacity] = await Promise.all([
    deps.members.list(ctx.tenantId),
    deps.invitations.listLive(ctx.tenantId, deps.clock.now()),
    deps.entitlements.canAddUser(ctx.tenantId),
  ]);
  return {
    members: members.map((m) => ({
      membershipId: m.membershipId,
      fullName: m.fullName,
      email: m.email,
      roles: m.roles,
      status: m.status,
      membershipStatus: m.membershipStatus,
      isSelf: m.userId === ctx.userId,
    })),
    invitations: invitations.map((i) => ({
      invitationId: i.id,
      email: i.email,
      roles: i.roles,
      expiresAt: i.expiresAt.toISOString(),
      invitedByName: i.invitedByName,
    })),
    seats: { used: capacity.used, limit: capacity.limit },
  };
}
