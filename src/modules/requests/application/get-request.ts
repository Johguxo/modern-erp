// Leer una solicitud: el solicitante, o quien tiene requests.read_all (salvo borradores ajenos).
// Si no existe, es de otro tenant o no tiene visibilidad → NotFoundError (404, no revela existencia).
import { requireAnyPermission } from '@/shared/authorization';
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
  if (!found || !canView(found.request, ctx)) {
    throw new NotFoundError({ message: 'Request not found' });
  }
  return toRequestView(found.request, found.lines);
}
