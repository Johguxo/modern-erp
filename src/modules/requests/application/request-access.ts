// Acceso a una solicitud ajena a la vista del que pregunta: 404 (no 403) para no revelar que existe.
import type { Ctx } from '@/shared/context';
import { ConflictError, NotFoundError } from '@/shared/errors';

import { canView } from '../domain/request';

import type { RequestRepository, RequestWithLines } from './ports';

/** Bloquea (FOR UPDATE) una solicitud propia: el borrador solo lo edita su solicitante. */
export async function lockOwnRequest(
  ctx: Ctx,
  requests: RequestRepository,
  id: string,
): Promise<RequestWithLines> {
  const found = await requests.lockById(ctx.tenantId, id);
  if (!found || !canView(found.request, ctx) || found.request.requesterId !== ctx.userId) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return found;
}

/** Bloqueo optimista: la versión que vio el cliente debe ser la vigente. */
export function assertVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new ConflictError({
      reason: 'stale_version',
      message: `Stale version: expected ${expected}, current ${current}`,
    });
  }
}
