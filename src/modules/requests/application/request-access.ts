// Acceso a una solicitud ajena a la vista del que pregunta: 404 (no 403) para no revelar que existe.
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ConflictError, NotFoundError } from '@/shared/errors';

import { canView } from '../domain/request';

import type { GetRequestDeps, RequestRepository, RequestWithLines } from './ports';

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

/**
 * Una solicitud que el usuario puede ver (el solicitante, quien tiene `requests.read_all` o el
 * aprobador asignado; un borrador solo lo ve su solicitante). Si no existe, es de otro tenant o no
 * la puede ver: NotFoundError (404, no revela existencia).
 */
export async function findVisibleRequest(
  ctx: Ctx,
  id: string,
  deps: GetRequestDeps,
): Promise<RequestWithLines> {
  const found = await deps.requests.find(ctx.tenantId, id);
  if (!found) throw new NotFoundError({ message: 'Request not found' });
  // Solo se consultan las asignaciones cuando pueden cambiar la respuesta.
  const needsAssignment =
    found.request.requesterId !== ctx.userId &&
    found.request.status !== 'draft' &&
    !hasPermission(ctx, 'requests.read_all');
  const assigned = needsAssignment
    ? await deps.assignments.isAssigned(ctx, found.request.id)
    : false;
  if (!canView(found.request, ctx, { assigned })) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return found;
}
