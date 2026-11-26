// Vista previa de la ruta de aprobación: quien crea solicitudes la ve antes de enviar, y quien
// administra las políticas también. Lee la política del tenant y resuelve los aprobadores con los
// miembros activos. No crea instancias ni consume numeración.
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

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
  if (!policy) {
    // E4-H2: al enviar sin política, fallar (no se envía un SOF sin ruta).
    // Aquí solo se avisa: el editor sigue abierto y muestra que falta configurar la ruta.
    deps.logger?.warn(
      { tenantId: ctx.tenantId, docType: input.docType },
      'approval policy missing: empty route preview',
    );
    return { docType: input.docType, policyName: '', steps: [] };
  }
  if (policy.hasReservedSteps) {
    deps.logger?.warn(
      { tenantId: ctx.tenantId, docType: input.docType, policyId: policy.id },
      'approval policy has reserved steps: preview shows only the supported ones',
    );
  }
  const members = await deps.directory.activeMembers(ctx.tenantId);
  return resolveRoute(input.docType, policy, input.total, members);
}
