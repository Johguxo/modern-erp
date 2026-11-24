// platform.inviteTenantAdmin (E1-H4): invita (o reinvita) a un admin del cliente desde la consola,
// por si el correo del alta estaba mal o no llegó. Respeta el cupo y el estado del cliente.
import type { PlatformCtx } from '@/shared/context';
import { ConflictError } from '@/shared/errors';

import { isInvitationLive } from '../../domain/invitation';
import { scheduleInvitationEmail } from '../invitation-email';
import { issueInvitation } from '../issue-invitation';

import { recordPlatformAudit } from './audit';
import type { PlatformDeps } from './ports';
import { assertPlatformAdmin, assertTenantCanAddUser, assertTenantWritable } from './shared';

export async function inviteTenantAdmin(
  ctx: PlatformCtx,
  input: { tenantId: string; email: string },
  deps: PlatformDeps,
): Promise<{ invitationId: string; emailSent: boolean }> {
  const now = deps.clock.now();
  const issued = await deps.store.transaction(async (uow) => {
    await assertPlatformAdmin(uow, ctx);
    await uow.locks.seats(input.tenantId);
    const tenantName = await uow.tenants.tenantName(input.tenantId);

    const member = await uow.members.findByEmail(input.tenantId, input.email);
    if (member?.membershipStatus === 'active') {
      throw new ConflictError({ reason: 'already_member', message: 'Email is already a member' });
    }
    // Un cliente en solo lectura no puede aceptar: no se envía un enlace que luego fallaría.
    await assertTenantWritable(uow, input.tenantId);
    const pending = await uow.invitations.findPendingByEmail(input.tenantId, input.email);
    if (!pending || !isInvitationLive(pending, now)) {
      await assertTenantCanAddUser(uow, input.tenantId);
    }

    const invitation = await issueInvitation(uow.invitations, {
      tenantId: input.tenantId,
      email: input.email,
      roles: ['admin'],
      invitedBy: ctx.userId,
      now,
      pending,
    });
    await recordPlatformAudit(
      ctx,
      input.tenantId,
      {
        action: invitation.renewed ? 'invitation.renewed' : 'invitation.created',
        entityType: 'invitation',
        entityId: invitation.invitationId,
        // Al renovar, la invitación pasa a admin: se guardan los roles que tenía.
        data: pending
          ? { email: input.email, from: { roles: [...pending.roles] }, to: { roles: ['admin'] } }
          : { email: input.email, roles: ['admin'] },
      },
      uow,
      deps,
    );
    return { ...invitation, tenantName };
  });

  scheduleInvitationEmail(
    { tenantId: input.tenantId, locale: 'es-PE' },
    {
      invitationId: issued.invitationId,
      email: input.email,
      token: issued.token,
      tokenHash: issued.tokenHash,
      tenantName: issued.tenantName,
    },
    deps,
  );
  return { invitationId: issued.invitationId, emailSent: false };
}
