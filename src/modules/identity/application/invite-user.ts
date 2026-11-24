// Invitar a un usuario (E1-H3). Bajo el bloqueo de cupos del tenant: si el correo ya es miembro
// activo → already_member; si tiene una invitación pendiente, se renueva (el cupo solo se revisa si
// estaba vencida); si no, se revisa el cupo y se crea. El correo sale después del commit.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ConflictError } from '@/shared/errors';
import type { Role } from '@/shared/permissions';

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

export async function inviteUser(
  ctx: Ctx,
  input: { email: string; roles: readonly Role[] },
  deps: UserAdminDeps,
): Promise<{ invitationId: string; emailSent: boolean }> {
  requirePermission(ctx, 'users.manage');
  await deps.locks.seats(ctx.tenantId);

  const member = await deps.members.findByEmail(ctx.tenantId, input.email);
  if (member?.membershipStatus === 'active') {
    throw new ConflictError({ reason: 'already_member', message: 'Email is already a member' });
  }

  const now = deps.clock.now();
  const pending = await deps.invitations.findPendingByEmail(ctx.tenantId, input.email);
  if (!pending || !isInvitationLive(pending, now)) {
    assertCanAddUser(await deps.entitlements.canAddUser(ctx.tenantId));
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const fields = {
    roles: input.roles,
    tokenHash,
    expiresAt: invitationExpiresAt(now),
    invitedBy: ctx.userId,
  };
  let invitationId: string;
  if (pending) {
    await deps.invitations.renew(ctx.tenantId, pending.id, fields);
    invitationId = pending.id;
  } else {
    invitationId = await deps.invitations.create({
      tenantId: ctx.tenantId,
      email: input.email,
      ...fields,
    });
  }

  await recordAudit(
    ctx,
    {
      action: pending ? 'invitation.renewed' : 'invitation.created',
      entityType: 'invitation',
      entityId: invitationId,
      data: { email: input.email, roles: [...input.roles] },
    },
    deps,
  );

  const tenantName = await deps.tenants.tenantName(ctx.tenantId);
  scheduleInvitationEmail(
    ctx,
    { invitationId, email: input.email, token, tokenHash, tenantName },
    deps,
  );
  return { invitationId, emailSent: false };
}
