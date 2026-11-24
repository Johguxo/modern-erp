// Reactivar a un miembro desactivado (E1-H3): vuelve a ocupar un cupo, así que se revisa el límite
// con el mismo bloqueo que al invitar.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { recordAudit } from './audit';
import { assertCanAddUser } from './seats';
import type { UserAdminDeps } from './user-admin-ports';

export async function reactivateMember(
  ctx: Ctx,
  input: { membershipId: string },
  deps: Pick<UserAdminDeps, 'members' | 'locks' | 'audit' | 'client' | 'entitlements'>,
): Promise<Record<string, never>> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.seats(ctx.tenantId);

  const target = await deps.members.findById(ctx.tenantId, input.membershipId);
  if (!target) throw new NotFoundError({ message: 'Membership not found' });
  if (target.membershipStatus === 'active') return {};

  assertCanAddUser(await deps.entitlements.canAddUser(ctx.tenantId));
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
