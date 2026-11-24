// Vista previa de /invitacion/[token] (E1-H3): decide qué formulario mostrar. Inválida, vencida y
// aceptada se ven igual (no revela cuál). Previa al ctx (ADR-006 §7).
import type { AuthProvider } from '@/shared/ports/auth-provider';
import type { Clock } from '@/shared/ports/clock';

import { hashInvitationToken, isInvitationLive } from '../domain/invitation';

import type { InvitationAcceptStore } from './invitation-accept-ports';

export type AcceptMode = 'new_account' | 'password' | 'session';

export type InvitationPreview =
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'valid';
      readonly email: string;
      readonly tenantName: string;
      readonly mode: AcceptMode;
    };

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function previewInvitation(
  input: { token: string },
  deps: { store: InvitationAcceptStore; auth: AuthProvider; clock: Clock },
): Promise<InvitationPreview> {
  if (!TOKEN.test(input.token)) return { kind: 'invalid' };
  const record = await deps.store.preview(hashInvitationToken(input.token));
  if (!record || !isInvitationLive(record.invitation, deps.clock.now())) {
    return { kind: 'invalid' };
  }

  const session = await deps.auth.getSession();
  let mode: AcceptMode;
  if (session && sameEmail(session.email, record.invitation.email)) mode = 'session';
  else if (record.account?.authUserId) mode = 'password';
  else mode = 'new_account';

  return { kind: 'valid', email: record.invitation.email, tenantName: record.tenantName, mode };
}
