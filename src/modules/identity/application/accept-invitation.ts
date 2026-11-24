// Aceptar una invitación (E1-H3, ADR-006 §9). Previa al ctx: el correo y la empresa salen de la
// invitación (nunca del cliente) y la escritura va por la conexión dueño, acotada por token_hash y
// auditada con el invitado como actor.
//   - Sesión con el mismo correo → solo se une.
//   - Cuenta existente sin sesión → su contraseña (inicia sesión con el correo de la invitación).
//   - Cuenta nueva → se crea en Auth con el correo confirmado; si la transacción falla después,
//     se borra (compensación).
// Al final la acción fija la empresa activa con { tenantId, authUserId }.
import {
  ConflictError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '@/shared/errors';
import type { AuthAdmin } from '@/shared/ports/auth-admin';
import type { AuthProvider } from '@/shared/ports/auth-provider';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { Logger } from '@/shared/ports/logger';

import { hashInvitationToken, isInvitationLive } from '../domain/invitation';

import type { Account, InvitationAcceptStore } from './invitation-accept-ports';
import { sameEmail } from './preview-invitation';

export type AcceptInvitationInput =
  | { mode: 'new_account'; token: string; fullName: string; password: string }
  | { mode: 'password'; token: string; password: string }
  | { mode: 'session'; token: string };

export interface AcceptInvitationDeps {
  readonly store: InvitationAcceptStore;
  readonly authAdmin: AuthAdmin;
  readonly auth: AuthProvider;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly client: ClientInfo;
}

const invalid = () =>
  new ValidationError({ reason: 'invitation_invalid', message: 'Invitation invalid or expired' });
const modeChanged = () => new ConflictError({ message: 'Invitation accept mode changed' });
const disabled = () => new ForbiddenError({ reason: 'account_disabled', message: 'User disabled' });

interface Identity {
  readonly authUserId: string;
  /** Cuenta creada en este request (para compensar y para iniciar sesión al final). */
  readonly created: { readonly password: string } | null;
  readonly fullName: string | null;
}

async function resolveIdentity(
  input: AcceptInvitationInput,
  email: string,
  account: Account | null,
  deps: AcceptInvitationDeps,
): Promise<Identity> {
  const session = await deps.auth.getSession();
  if (session && sameEmail(session.email, email)) {
    return { authUserId: session.authUserId, created: null, fullName: null };
  }

  if (account?.authUserId) {
    if (input.mode !== 'password') throw modeChanged();
    const result = await deps.auth.signInWithPassword(email, input.password);
    if (!result.ok) {
      if (result.reason === 'rate_limited') {
        throw new ForbiddenError({ reason: 'too_many_attempts', message: 'Auth rate limited' });
      }
      throw new UnauthenticatedError({
        reason: 'invalid_credentials',
        message: 'Invalid credentials',
      });
    }
    return { authUserId: result.authUserId, created: null, fullName: null };
  }

  if (input.mode !== 'new_account') throw modeChanged();
  const result = await deps.authAdmin.createUser({
    email,
    password: input.password,
    fullName: input.fullName,
  });
  if (!result.ok) {
    if (result.reason === 'email_exists') {
      throw new ConflictError({ reason: 'email_in_use', message: 'Auth user already exists' });
    }
    throw new ValidationError({
      reason: 'password_rejected',
      fieldErrors: { password: ['password_rejected'] },
      message: 'Password rejected by Auth',
    });
  }
  return {
    authUserId: result.authUserId,
    created: { password: input.password },
    fullName: input.fullName,
  };
}

export async function acceptInvitation(
  input: AcceptInvitationInput,
  deps: AcceptInvitationDeps,
): Promise<{ tenantId: string; authUserId: string }> {
  const tokenHash = hashInvitationToken(input.token);
  const preview = await deps.store.preview(tokenHash);
  if (!preview || !isInvitationLive(preview.invitation, deps.clock.now())) throw invalid();
  if (preview.account?.status === 'disabled') throw disabled();

  const email = preview.invitation.email;
  const identity = await resolveIdentity(input, email, preview.account, deps);

  let tenantId: string;
  try {
    tenantId = await deps.store.transaction(async (uow) => {
      // Se vuelve a validar con la fila bloqueada: dos aceptaciones simultáneas → una gana.
      const invitation = await uow.lockInvitation(tokenHash);
      const now = deps.clock.now();
      if (!invitation || !isInvitationLive(invitation, now)) throw invalid();
      await uow.lockSeats(invitation.tenantId);

      const account = await uow.findAccount(invitation.email);
      let userId: string;
      if (!account) {
        userId = await uow.createUser({
          email: invitation.email,
          fullName: identity.fullName ?? invitation.email,
          authUserId: identity.authUserId,
        });
      } else {
        if (account.status === 'disabled') throw disabled();
        if (account.authUserId === null) {
          await uow.linkAuthUser(account.userId, identity.authUserId);
        } else if (account.authUserId !== identity.authUserId) {
          throw new ConflictError({ message: 'Auth user does not match platform user' });
        }
        userId = account.userId;
      }

      const membership = await uow.findMembership(invitation.tenantId, userId);
      let membershipId: string;
      let outcome: 'created' | 'reactivated' | 'already_active';
      if (!membership) {
        membershipId = await uow.createMembership({
          tenantId: invitation.tenantId,
          userId,
          roles: invitation.roles,
        });
        outcome = 'created';
      } else if (membership.status === 'disabled') {
        await uow.reactivateMembership(invitation.tenantId, membership.id, invitation.roles);
        membershipId = membership.id;
        outcome = 'reactivated';
      } else {
        // Ya era miembro activo (carrera con otra invitación): se respetan sus roles actuales.
        membershipId = membership.id;
        outcome = 'already_active';
      }

      await uow.markAccepted(invitation.id, now);
      await uow.audit.record({
        tenantId: invitation.tenantId,
        actorUserId: userId,
        actorType: 'user',
        action: 'invitation.accepted',
        entityType: 'invitation',
        entityId: invitation.id,
        data: { email: invitation.email, roles: [...invitation.roles], membershipId, outcome },
        ip: deps.client.ip,
        userAgent: deps.client.userAgent,
      });
      return invitation.tenantId;
    });
  } catch (error) {
    if (identity.created) {
      try {
        await deps.authAdmin.deleteUser(identity.authUserId);
      } catch (cleanupError) {
        deps.logger.error(
          { err: cleanupError, authUserId: identity.authUserId },
          'invitation accept compensation failed',
        );
      }
    }
    throw error;
  }

  if (identity.created) {
    const result = await deps.auth.signInWithPassword(email, identity.created.password);
    // La membresía ya existe: si el login automático falla, el usuario entra desde /login.
    if (!result.ok) deps.logger.warn({ reason: result.reason }, 'sign in after accept failed');
  }
  return { tenantId, authUserId: identity.authUserId };
}
