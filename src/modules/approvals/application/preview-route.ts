// Vista previa de la ruta de aprobación: quien crea solicitudes la ve antes de enviar, y quien
// administra las políticas también. No crea instancias ni consume numeración.
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { toRoutePreview, type DocType, type RoutePreview } from '../domain/route-preview';

import type { PreviewRouteDeps } from './ports';

export async function previewRoute(
  ctx: Ctx,
  input: { readonly docType: DocType },
  deps: PreviewRouteDeps,
): Promise<RoutePreview> {
  requireAnyPermission(ctx, ['requests.create', 'approval_policies.manage']);
  const policy = await deps.policies.activeFor(ctx, input.docType);
  return toRoutePreview(input.docType, policy);
}
