// Invitaciones (E1-H3): token de un solo uso, su hash y el vencimiento. El token en claro solo
// viaja en el correo; en la base se guarda su sha256 (modelo-datos.md). Nunca va a logs,
// auditoría ni respuestas.
import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 bytes aleatorios en base64url (43 caracteres). */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 en hex: es lo único que se guarda (`invitations.token_hash`). */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS);
}

export interface InvitationState {
  readonly acceptedAt: Date | null;
  readonly expiresAt: Date;
}

/** Pendiente y sin vencer: se puede aceptar y ocupa un cupo del plan. */
export function isInvitationLive(invitation: InvitationState, now: Date): boolean {
  return invitation.acceptedAt === null && invitation.expiresAt.getTime() > now.getTime();
}

/** Ruta pública del enlace (la URL completa se arma con APP_URL). */
export function invitationPath(token: string): `/invitacion/${string}` {
  return `/invitacion/${token}`;
}
