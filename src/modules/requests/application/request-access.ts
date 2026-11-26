// Acceso a una solicitud ajena a la vista del que pregunta: 404 (no 403) para no revelar que existe.
import { hasPermission, requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ConflictError, NotFoundError } from '@/shared/errors';

import { canView, type Request } from '../domain/request';

import type {
  ApprovalAssignments,
  GetRequestDeps,
  RequestRepository,
  RequestWithLines,
} from './ports';

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

/** ¿El usuario ve este documento? Solo consulta las asignaciones cuando pueden cambiar la respuesta. */
async function isVisibleTo(
  ctx: Ctx,
  request: Request,
  assignments: ApprovalAssignments,
): Promise<boolean> {
  const needsAssignment =
    request.requesterId !== ctx.userId &&
    request.number !== null &&
    !hasPermission(ctx, 'requests.read_all');
  const assigned = needsAssignment ? await assignments.isAssigned(ctx, request.id) : false;
  return canView(request, ctx, { assigned });
}

/**
 * Una solicitud que el usuario puede ver (el solicitante, quien tiene `requests.read_all` o el
 * aprobador asignado; lo que nunca se envió, sin número, solo lo ve su solicitante). Si no existe,
 * es de otro tenant o no la puede ver: NotFoundError (404, no revela existencia).
 */
export async function findVisibleRequest(
  ctx: Ctx,
  id: string,
  deps: GetRequestDeps,
): Promise<RequestWithLines> {
  requireAnyPermission(ctx, ['requests.create', 'requests.read_own', 'requests.read_all']);
  const found = await deps.requests.find(ctx.tenantId, id);
  if (!found || !(await isVisibleTo(ctx, found.request, deps.assignments))) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return found;
}

/**
 * Como `findVisibleRequest`, pero bloquea la fila (FOR UPDATE) para una transición. El permiso
 * lo revisa el caso de uso antes (la anulación admite más de uno).
 */
export async function lockVisibleRequest(
  ctx: Ctx,
  id: string,
  deps: Pick<GetRequestDeps, 'requests' | 'assignments'>,
): Promise<RequestWithLines> {
  const found = await deps.requests.lockById(ctx.tenantId, id);
  if (!found || !(await isVisibleTo(ctx, found.request, deps.assignments))) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return found;
}
