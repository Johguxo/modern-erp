// Reactivar a un miembro desactivado (E1-H3): vuelve a ocupar un cupo, así que se revisa el límite
// con el mismo bloqueo que al invitar. Si el correo tenía una invitación pendiente vigente en este
// tenant, se anula (si no, ocuparía dos cupos y luego podría reenviarse a un miembro activo).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { isInvitationLive } from '../domain/invitation';

import { recordAudit } from './audit';
import { assertCanAddUser } from './seats';
import type { UserAdminDeps } from './user-admin-ports';

export async function reactivateMember(
  ctx: Ctx,
  input: { membershipId: string },
  deps: Pick<
    UserAdminDeps,
    'members' | 'invitations' | 'locks' | 'audit' | 'client' | 'clock' | 'entitlements'
  >,
): Promise<Record<string, never>> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.seats(ctx.tenantId);

  const target = await deps.members.findById(ctx.tenantId, input.membershipId);
  if (!target) throw new NotFoundError({ message: 'Membership not found' });
  if (target.membershipStatus === 'active') return {};

  const now = deps.clock.now();
  const pending = await deps.invitations.findPendingByEmail(ctx.tenantId, target.email);
  const transfersSeat = pending !== null && isInvitationLive(pending, now);

  // Si la invitación vigente se anula aquí, su cupo pasa a la membresía (el uso no cambia): el
  // límite no bloquea. Solo lectura y sin suscripción bloquean siempre.
  const capacity = await deps.entitlements.canAddUser(ctx.tenantId);
  if (!(transfersSeat && capacity.reason === 'limit_reached')) assertCanAddUser(capacity);

  if (pending && transfersSeat) {
    await deps.invitations.expire(ctx.tenantId, pending.id, now);
    await recordAudit(
      ctx,
      {
        action: 'invitation.cancelled',
        entityType: 'invitation',
        entityId: pending.id,
        data: { email: pending.email, reason: 'member_reactivated' },
      },
      deps,
    );
  }

  await deps.members.updateStatus(ctx.tenantId, target.membershipId, 'active');
  await recordAudit(
    ctx,
    {
      action: 'membership.reactivated',
      entityType: 'membership',
      entityId: target.membershipId,
      data: { userId: target.userId },
    },
    deps,
  );
  return {};
}
