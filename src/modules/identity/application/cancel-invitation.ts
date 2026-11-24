// Anular una invitación pendiente (E1-H3): vence ahora y libera el cupo. Sin migración.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { recordAudit } from './audit';
import type { UserAdminDeps } from './user-admin-ports';

export async function cancelInvitation(
  ctx: Ctx,
  input: { invitationId: string },
  deps: Pick<UserAdminDeps, 'invitations' | 'audit' | 'clock' | 'client'>,
): Promise<Record<string, never>> {
  requirePermission(ctx, 'users.manage');
  const invitation = await deps.invitations.findPendingById(ctx.tenantId, input.invitationId);
  if (!invitation) throw new NotFoundError({ message: 'Pending invitation not found' });

  await deps.invitations.expire(ctx.tenantId, invitation.id, deps.clock.now());
  await recordAudit(
    ctx,
    {
      action: 'invitation.cancelled',
      entityType: 'invitation',
      entityId: invitation.id,
      data: { email: invitation.email },
    },
    deps,
  );
  return {};
}
