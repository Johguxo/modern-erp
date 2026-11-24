// Reenviar una invitación pendiente (E1-H3): token y vencimiento nuevos sobre la misma fila (el
// enlace anterior deja de servir). Si estaba vencida vuelve a ocupar un cupo: se revisa el límite.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  isInvitationLive,
} from '../domain/invitation';

import { recordAudit } from './audit';
import { scheduleInvitationEmail } from './invitation-email';
import { assertCanAddUser } from './seats';
import type { UserAdminDeps } from './user-admin-ports';

export async function resendInvitation(
  ctx: Ctx,
  input: { invitationId: string },
  deps: UserAdminDeps,
): Promise<{ emailSent: boolean }> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.seats(ctx.tenantId);

  const invitation = await deps.invitations.findPendingById(ctx.tenantId, input.invitationId);
  if (!invitation) throw new NotFoundError({ message: 'Pending invitation not found' });

  const now = deps.clock.now();
  if (!isInvitationLive(invitation, now)) {
    assertCanAddUser(await deps.entitlements.canAddUser(ctx.tenantId));
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  await deps.invitations.renew(ctx.tenantId, invitation.id, {
    roles: invitation.roles,
    tokenHash,
    expiresAt: invitationExpiresAt(now),
    invitedBy: ctx.userId,
  });
  await recordAudit(
    ctx,
    {
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: invitation.id,
      data: { email: invitation.email },
    },
    deps,
  );

  const tenantName = await deps.tenants.tenantName(ctx.tenantId);
  scheduleInvitationEmail(
    ctx,
    { invitationId: invitation.id, email: invitation.email, token, tokenHash, tenantName },
    deps,
  );
  return { emailSent: false };
}
