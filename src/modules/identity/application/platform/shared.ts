// Piezas comunes de los casos de uso de la consola (E1-H4).
import type { PlatformCtx } from '@/shared/context';
import { ForbiddenError, LimitExceededError } from '@/shared/errors';

import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from '../../domain/invitation';

import type { PlatformUnitOfWork } from './ports';

/** Defensa en profundidad: la entrega ya lo revisó, pero se repite dentro de la transacción. */
export async function assertPlatformAdmin(
  uow: PlatformUnitOfWork,
  ctx: PlatformCtx,
): Promise<void> {
  if (!(await uow.isPlatformAdmin(ctx.userId))) {
    throw new ForbiddenError({ message: 'Not a platform admin' });
  }
}

/** Cupo del cliente, con mensajes para el SuperAdmin (no para el usuario del cliente). */
export async function assertTenantCanAddUser(
  uow: PlatformUnitOfWork,
  tenantId: string,
): Promise<void> {
  const capacity = await uow.entitlements.canAddUser(tenantId);
  if (capacity.allowed) return;
  if (capacity.reason === 'limit_reached') {
    throw new LimitExceededError({
      reason: 'tenant_seats_full',
      params: { max: capacity.limit ?? 0 },
      message: `Tenant user limit reached (${capacity.used}/${String(capacity.limit)})`,
    });
  }
  throw new ForbiddenError({ reason: 'tenant_inactive', message: 'Tenant is read-only' });
}

/**
 * Crea la invitación de admin del cliente, o renueva la pendiente del mismo correo (token y
 * vencimiento nuevos). Devuelve el token en claro solo para el correo.
 */
export async function issueAdminInvitation(
  uow: PlatformUnitOfWork,
  input: { tenantId: string; email: string; invitedBy: string; now: Date },
): Promise<{ invitationId: string; token: string; tokenHash: string; renewed: boolean }> {
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const fields = {
    roles: ['admin'] as const,
    tokenHash,
    expiresAt: invitationExpiresAt(input.now),
    invitedBy: input.invitedBy,
  };
  const pending = await uow.invitations.findPendingByEmail(input.tenantId, input.email);
  if (pending) {
    await uow.invitations.renew(input.tenantId, pending.id, fields);
    return { invitationId: pending.id, token, tokenHash, renewed: true };
  }
  const invitationId = await uow.invitations.create({
    tenantId: input.tenantId,
    email: input.email,
    ...fields,
  });
  return { invitationId, token, tokenHash, renewed: false };
}
