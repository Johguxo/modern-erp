// Vista previa de la ruta de aprobación: quien crea solicitudes la ve antes de enviar, y quien
// administra las políticas también. Lee la política del tenant y resuelve los aprobadores con los
// miembros activos. No crea instancias ni consume numeración.
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { resolveRoute } from '../domain/resolve-route';
import type { DocType, RoutePreview } from '../domain/route-preview';

import type { PreviewRouteDeps } from './ports';

export async function previewRoute(
  ctx: Ctx,
  input: { readonly docType: DocType; readonly total: string | null },
  deps: PreviewRouteDeps,
): Promise<RoutePreview> {
  requireAnyPermission(ctx, ['requests.create', 'approval_policies.manage']);
  const policy = await deps.policies.findActive(ctx.tenantId, input.docType);
  if (!policy) throw new NotFoundError({ message: 'Approval policy not found' });
  const members = await deps.directory.activeMembers(ctx.tenantId);
  return resolveRoute(input.docType, policy, input.total, members);
}
