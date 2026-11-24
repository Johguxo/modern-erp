// Editar los roles de un miembro (E1-H3). Con el bloqueo `admins:` del tenant, ningún cambio puede
// dejar a la empresa sin un miembro activo que gestione usuarios (last_admin).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { Role } from '@/shared/permissions';

import { keepsAUserManager, type MemberSnapshot } from '../domain/membership-rules';

import { recordAudit } from './audit';
import type { MemberRecord, UserAdminDeps } from './user-admin-ports';

export function toSnapshots(members: readonly MemberRecord[]): MemberSnapshot[] {
  return members.map((m) => ({
    membershipId: m.membershipId,
    roles: m.roles,
    active: m.status === 'active',
  }));
}

export function lastAdminError(): ForbiddenError {
  return new ForbiddenError({ reason: 'last_admin', message: 'Change would leave no admin' });
}

export async function updateMemberRoles(
  ctx: Ctx,
  input: { membershipId: string; roles: readonly Role[] },
  deps: Pick<UserAdminDeps, 'members' | 'locks' | 'audit' | 'client'>,
): Promise<Record<string, never>> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.admins(ctx.tenantId);

  const members = await deps.members.list(ctx.tenantId);
  const target = members.find((m) => m.membershipId === input.membershipId);
  if (!target) throw new NotFoundError({ message: 'Membership not found' });

  if (
    !keepsAUserManager(toSnapshots(members), {
      membershipId: target.membershipId,
      roles: input.roles,
    })
  ) {
    throw lastAdminError();
  }

  await deps.members.updateRoles(ctx.tenantId, target.membershipId, input.roles);
  await recordAudit(
    ctx,
    {
      action: 'membership.roles_updated',
      entityType: 'membership',
      entityId: target.membershipId,
      data: { userId: target.userId, before: [...target.roles], after: [...input.roles] },
    },
    deps,
  );
  return {};
}
