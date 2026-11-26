// Asignaciones del motor para la bandeja y la visibilidad (E4-H2): a quién espera cada solicitud.
// Son lecturas del usuario del ctx; la solicitud y los permisos los revisa quien llama.
import type { Ctx } from '@/shared/context';

import type { ApprovalQueries } from './ports';

export interface ApprovalAssignmentsView {
  /** Solicitudes donde el usuario del ctx es aprobador asignado (cualquier paso). */
  assignedRequestIds(ctx: Ctx): Promise<readonly string[]>;
  isAssigned(ctx: Ctx, requestId: string): Promise<boolean>;
  /** Solicitudes cuyo paso pendiente actual es del usuario del ctx. */
  pendingRequestIds(ctx: Ctx): Promise<readonly string[]>;
  /** El paso pendiente del usuario en esa solicitud; null si no tiene. */
  pendingStepId(ctx: Ctx, requestId: string): Promise<string | null>;
}

export function createApprovalAssignments(queries: ApprovalQueries): ApprovalAssignmentsView {
  return {
    assignedRequestIds: (ctx) => queries.assignedRequestIds(ctx.tenantId, ctx.userId),
    isAssigned: (ctx, requestId) => queries.isAssigned(ctx.tenantId, ctx.userId, requestId),
    pendingRequestIds: (ctx) => queries.pendingRequestIds(ctx.tenantId, ctx.userId),
    pendingStepId: (ctx, requestId) => queries.pendingStepId(ctx.tenantId, ctx.userId, requestId),
  };
}
