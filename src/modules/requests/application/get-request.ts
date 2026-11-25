// Leer una solicitud: el solicitante, quien tiene requests.read_all o el aprobador asignado (salvo
// borradores ajenos). Si no existe, es de otro tenant o no tiene visibilidad → NotFoundError (404,
// no revela existencia).
import { hasPermission, requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { canView } from '../domain/request';

import type { GetRequestDeps } from './ports';
import { toRequestView, type RequestView } from './views';

export async function getRequest(
  ctx: Ctx,
  input: { readonly id: string },
  deps: GetRequestDeps,
): Promise<RequestView> {
  requireAnyPermission(ctx, ['requests.create', 'requests.read_own', 'requests.read_all']);
  const found = await deps.requests.find(ctx.tenantId, input.id);
  if (!found) throw new NotFoundError({ message: 'Request not found' });
  // Solo se consultan las asignaciones cuando pueden cambiar la respuesta.
  const needsAssignment =
    found.request.requesterId !== ctx.userId &&
    found.request.status !== 'draft' &&
    !hasPermission(ctx, 'requests.read_all');
  const assigned = needsAssignment
    ? (await deps.assignments.assignedRequestIds(ctx)).includes(found.request.id)
    : false;
  if (!canView(found.request, ctx, { assigned })) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return toRequestView(found.request, found.lines);
}
