// Asignaciones del motor para la bandeja y la visibilidad (E4-H2): a quién espera cada solicitud.
// Son lecturas del usuario del ctx; la solicitud la revisa quien llama. Sin `approvals.decide` el
// usuario no cuenta como aprobador aunque conserve una asignación vieja (p. ej. le quitaron el rol).
import type { Ctx } from '@/shared/context';

import type { ApprovalQueries } from './ports';

/** La decisión que detuvo la ronda, con la forma del puerto ApprovalHistory de requests. */
export interface ApprovalHistoryView {
  latestDecision(
    ctx: Ctx,
    requestId: string,
  ): Promise<{
    readonly kind: 'reject' | 'request_changes';
    readonly actorId: string;
    readonly comment: string | null;
    readonly at: Date;
  } | null>;
}

export function createApprovalHistory(queries: ApprovalQueries): ApprovalHistoryView {
  return {
    async latestDecision(ctx, requestId) {
      const step = await queries.latestStoppingStep(ctx.tenantId, requestId);
      return step
        ? { kind: step.kind, actorId: step.decidedBy, comment: step.comment, at: step.decidedAt }
        : null;
    },
  };
}

export interface ApprovalAssignmentsView {
  /** Solicitudes donde el usuario del ctx es aprobador asignado (cualquier paso). */
  assignedRequestIds(ctx: Ctx): Promise<readonly string[]>;
  isAssigned(ctx: Ctx, requestId: string): Promise<boolean>;
  /** Solicitudes cuyo paso pendiente actual es del usuario del ctx. */
  pendingRequestIds(ctx: Ctx): Promise<readonly string[]>;
  /** El paso pendiente del usuario en esa solicitud; null si no tiene. */
  pendingStepId(ctx: Ctx, requestId: string): Promise<string | null>;
}

const canDecide = (ctx: Ctx): boolean => ctx.permissions.has('approvals.decide');

export function createApprovalAssignments(queries: ApprovalQueries): ApprovalAssignmentsView {
  return {
    assignedRequestIds: (ctx) =>
      canDecide(ctx) ? queries.assignedRequestIds(ctx.tenantId, ctx.userId) : Promise.resolve([]),
    isAssigned: (ctx, requestId) =>
      canDecide(ctx)
        ? queries.isAssigned(ctx.tenantId, ctx.userId, requestId)
        : Promise.resolve(false),
    pendingRequestIds: (ctx) =>
      canDecide(ctx) ? queries.pendingRequestIds(ctx.tenantId, ctx.userId) : Promise.resolve([]),
    pendingStepId: (ctx, requestId) =>
      canDecide(ctx)
        ? queries.pendingStepId(ctx.tenantId, ctx.userId, requestId)
        : Promise.resolve(null),
  };
}
