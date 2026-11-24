// Desactivar a un miembro en esta empresa (E1-H3). Nadie se desactiva a sí mismo y no puede quedar
// la empresa sin admin. La cuenta sigue activa en otras empresas: no se revocan sus sesiones de
// Supabase; el resolver de sesión ya lo bloquea en la siguiente petición (ADR-006).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

import { isSelf, keepsAUserManager } from '../domain/membership-rules';

import { recordAudit } from './audit';
import { lastAdminError, toSnapshots } from './update-member-roles';
import type { UserAdminDeps } from './user-admin-ports';

export async function disableMember(
  ctx: Ctx,
  input: { membershipId: string },
  deps: Pick<UserAdminDeps, 'members' | 'locks' | 'audit' | 'client'>,
): Promise<Record<string, never>> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.admins(ctx.tenantId);

  const members = await deps.members.list(ctx.tenantId);
  const target = members.find((m) => m.membershipId === input.membershipId);
  if (!target) throw new NotFoundError({ message: 'Membership not found' });
  if (isSelf(ctx.userId, target.userId)) {
    throw new ForbiddenError({ reason: 'cannot_disable_self', message: 'Cannot disable self' });
  }
  if (target.membershipStatus === 'disabled') return {};

  if (
    !keepsAUserManager(toSnapshots(members), { membershipId: target.membershipId, active: false })
  ) {
    throw lastAdminError();
  }

  await deps.members.updateStatus(ctx.tenantId, target.membershipId, 'disabled');
  await recordAudit(
    ctx,
    {
      action: 'membership.disabled',
      entityType: 'membership',
      entityId: target.membershipId,
      data: { userId: target.userId },
    },
    deps,
  );
  return {};
}
