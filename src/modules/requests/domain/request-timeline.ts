// Línea de tiempo del SOF (E3-H4), armada solo con las fechas del documento. E4-H3 agrega el
// puerto ApprovalTimeline con los pasos y firmantes reales; esta función queda como respaldo y
// fija la forma estable de TimelineItem.
import type { Request } from './request';

export const TIMELINE_KINDS = [
  'created',
  'submitted',
  'changes_requested',
  'approval',
  'approved',
  'delivery',
  'rejected',
  'cancelled',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/**
 * - `done`: ya ocurrió.
 * - `pending`: ocurre ahora (esperando aprobación).
 * - `upcoming`: todavía no toca.
 * - `stopped`: el documento se detuvo aquí (rechazada, anulada o con cambios pedidos).
 */
export const TIMELINE_STATES = ['done', 'pending', 'upcoming', 'stopped'] as const;
export type TimelineState = (typeof TIMELINE_STATES)[number];

export interface TimelineItem {
  readonly kind: TimelineKind;
  readonly state: TimelineState;
  /** Fecha del hito; null si aún no ocurre o no se registró. */
  readonly at: Date | null;
  /** Quién lo hizo; null cuando solo se conoce la fecha. */
  readonly actorId: string | null;
}

export type TimelineSource = Pick<
  Request,
  | 'status'
  | 'requesterId'
  | 'createdAt'
  | 'updatedAt'
  | 'submittedAt'
  | 'approvedAt'
  | 'deliveredAt'
  | 'closedAt'
>;

const item = (
  kind: TimelineKind,
  state: TimelineState,
  at: Date | null,
  actorId: string | null = null,
): TimelineItem => ({ kind, state, at, actorId });

export function deriveTimeline(request: TimelineSource): TimelineItem[] {
  const items: TimelineItem[] = [item('created', 'done', request.createdAt, request.requesterId)];
  if (request.submittedAt) {
    items.push(item('submitted', 'done', request.submittedAt, request.requesterId));
  }
  // Rechazada y anulada no guardan su propia fecha: se usa el cierre o, en su defecto, la última
  // actualización.
  const endedAt = request.closedAt ?? request.updatedAt;

  switch (request.status) {
    case 'draft':
      items.push(item('approval', 'upcoming', null), item('delivery', 'upcoming', null));
      break;
    case 'changes_requested':
      // El aprobador pidió cambios: se detiene aquí hasta que el solicitante reenvíe (flujo §1).
      items.push(
        item('changes_requested', 'stopped', request.updatedAt),
        item('approval', 'upcoming', null),
        item('delivery', 'upcoming', null),
      );
      break;
    case 'in_approval':
      items.push(item('approval', 'pending', null), item('delivery', 'upcoming', null));
      break;
    case 'approved':
      items.push(item('approved', 'done', request.approvedAt), item('delivery', 'upcoming', null));
      break;
    case 'delivered':
      items.push(
        item('approved', 'done', request.approvedAt),
        item('delivery', 'done', request.deliveredAt),
      );
      break;
    case 'rejected':
      items.push(item('rejected', 'stopped', endedAt));
      break;
    case 'cancelled':
      items.push(item('cancelled', 'stopped', endedAt));
      break;
  }
  return items;
}
