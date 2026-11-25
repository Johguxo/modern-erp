// Piezas comunes de los casos de uso de la consola (E1-H4).
import type { PlatformCtx } from '@/shared/context';
import { ForbiddenError, LimitExceededError } from '@/shared/errors';

import type { PlatformGuard, PlatformUnitOfWork } from './ports';

/** Defensa en profundidad: la entrega ya lo revisó, pero se repite dentro de la transacción. */
export async function assertPlatformAdmin(guard: PlatformGuard, ctx: PlatformCtx): Promise<void> {
  if (!(await guard.isPlatformAdmin(ctx.userId))) {
    throw new ForbiddenError({ message: 'Not a platform admin' });
  }
}

/** Cliente en solo lectura o sin suscripción vigente: no se invita a nadie. */
export async function assertTenantWritable(
  uow: PlatformUnitOfWork,
  tenantId: string,
): Promise<void> {
  if (await uow.entitlements.isReadOnly(tenantId)) {
    throw new ForbiddenError({ reason: 'tenant_inactive', message: 'Tenant is read-only' });
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
