// Leer una solicitud: el solicitante, quien tiene requests.read_all o el aprobador asignado (salvo
// borradores ajenos). Si no existe, es de otro tenant o no tiene visibilidad → NotFoundError (404,
// no revela existencia).
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import type { GetRequestDeps } from './ports';
import { findVisibleRequest } from './request-access';
import { toRequestView, type RequestView } from './views';

export async function getRequest(
  ctx: Ctx,
  input: { readonly id: string },
  deps: GetRequestDeps,
): Promise<RequestView> {
  requireAnyPermission(ctx, ['requests.create', 'requests.read_own', 'requests.read_all']);
  const found = await findVisibleRequest(ctx, input.id, deps);
  return toRequestView(found.request, found.lines);
}
