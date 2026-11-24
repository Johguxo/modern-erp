// Correo de invitación (E1-H3): se envía después del commit, sin cola. Si falla, la invitación
// queda guardada, se registra un warn (sin el token) y la acción responde `emailSent: false`.
import type { Ctx } from '@/shared/context';

import { INVITATION_TTL_DAYS, invitationPath } from '../domain/invitation';

import type { UserAdminDeps } from './user-admin-ports';

export interface InvitationEmail {
  readonly invitationId: string;
  readonly email: string;
  readonly token: string;
  readonly tokenHash: string;
  readonly tenantName: string;
}

export function scheduleInvitationEmail(
  ctx: Pick<Ctx, 'tenantId' | 'locale'>,
  invitation: InvitationEmail,
  deps: Pick<UserAdminDeps, 'mailer' | 'logger' | 'afterCommit' | 'appUrl'>,
): void {
  const url = new URL(invitationPath(invitation.token), deps.appUrl).toString();
  deps.afterCommit(async () => {
    try {
      await deps.mailer.send({
        to: [invitation.email],
        template: 'identity.invitation',
        data: { tenantName: invitation.tenantName, url, expiresInDays: INVITATION_TTL_DAYS },
        tenantId: ctx.tenantId,
        locale: ctx.locale,
        // Un reintento con el mismo token no duplica el correo; el hash no revela el token.
        idempotencyKey: `invitation-${invitation.invitationId}-${invitation.tokenHash.slice(0, 16)}`,
      });
      return { emailSent: true };
    } catch (error) {
      deps.logger.warn(
        { err: error, invitationId: invitation.invitationId },
        'invitation email failed',
      );
      return { emailSent: false };
    }
  });
}
