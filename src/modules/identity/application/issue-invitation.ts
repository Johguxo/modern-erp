// Crear o renovar una invitación (E1-H3, E1-H4): token nuevo (solo se guarda su sha256) y
// vencimiento a 7 días. Lo comparten invitar, reenviar y la consola de plataforma. El token en
// claro solo vuelve para el correo.
import type { Role } from '@/shared/permissions';

import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from '../domain/invitation';

import type { InvitationRepository } from './user-admin-ports';

export interface IssuedInvitation {
  readonly invitationId: string;
  readonly token: string;
  readonly tokenHash: string;
  readonly renewed: boolean;
}

export async function issueInvitation(
  invitations: InvitationRepository,
  input: {
    tenantId: string;
    email: string;
    roles: readonly Role[];
    invitedBy: string;
    now: Date;
    /** Invitación pendiente del mismo correo: se renueva sobre la misma fila. */
    pending: { readonly id: string } | null;
  },
): Promise<IssuedInvitation> {
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const fields = {
    roles: input.roles,
    tokenHash,
    expiresAt: invitationExpiresAt(input.now),
    invitedBy: input.invitedBy,
  };
  if (input.pending) {
    await invitations.renew(input.tenantId, input.pending.id, fields);
    return { invitationId: input.pending.id, token, tokenHash, renewed: true };
  }
  const invitationId = await invitations.create({
    tenantId: input.tenantId,
    email: input.email,
    ...fields,
  });
  return { invitationId, token, tokenHash, renewed: false };
}
