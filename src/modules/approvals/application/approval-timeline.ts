// Línea de tiempo de la aprobación para el detalle del SOF (E4-H3). La solicitud ya la revisó quien
// llama (visibilidad en requests); aquí solo se leen eventos y pasos del tenant del ctx.
import type { Ctx } from '@/shared/context';

import { buildApprovalTimeline, type ApprovalTimelineEntry } from '../domain/timeline';

import type { ApprovalQueries } from './ports';

export interface ApprovalTimelineView {
  /** Los ítems de todas las rondas; null si la solicitud nunca se envió (no tiene instancia). */
  getTimeline(ctx: Ctx, requestId: string): Promise<readonly ApprovalTimelineEntry[] | null>;
}

export function createApprovalTimeline(
  queries: Pick<ApprovalQueries, 'timelineSource'>,
): ApprovalTimelineView {
  return {
    async getTimeline(ctx, requestId) {
      const source = await queries.timelineSource(ctx.tenantId, requestId);
      return source ? buildApprovalTimeline(source) : null;
    },
  };
}
