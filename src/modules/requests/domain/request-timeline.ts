// Línea de tiempo del SOF. `buildTimeline` (E4-H3) combina el documento con los ítems del puerto
// ApprovalTimeline (eventos de todas las rondas y pasos abiertos); `deriveTimeline` (E3-H4) queda de
// respaldo para los SOF sin instancia, armada solo con las fechas del documento.
import type { Request } from './request';

export const TIMELINE_KINDS = [
  'created',
  'submitted',
  'resubmitted',
  'step_approved',
  'step_signed',
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
  /** Comentario del hito (la anulación guarda el suyo); null si no tiene. */
  readonly comment: string | null;
  /** Nombre del paso tal como lo escribió el admin (`step_approved`, `step_signed` y `approval`); si no, null. */
  readonly stepName: string | null;
  /** Regla del paso (`approval`): `any` espera a uno, `all` a todos. */
  readonly rule: 'any' | 'all' | null;
  /** Solo en un paso `approval` pendiente: los asignados que aún no deciden. */
  readonly assigneeIds: readonly string[];
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
  | 'closedBy'
  | 'closeComment'
>;

const item = (
  kind: TimelineKind,
  state: TimelineState,
  at: Date | null,
  actorId: string | null = null,
  comment: string | null = null,
): TimelineItem => ({
  kind,
  state,
  at,
  actorId,
  comment,
  stepName: null,
  rule: null,
  assigneeIds: [],
});

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
      // Quien anuló y su comentario están en la cabecera (E3-H5); antes de eso, solo la fecha.
      items.push(item('cancelled', 'stopped', endedAt, request.closedBy, request.closeComment));
      break;
  }
  return items;
}

/** Un ítem del puerto ApprovalTimeline: lo que dibuja el motor de aprobaciones (E4-H3). */
export interface ApprovalTimelineEntry {
  readonly kind:
    | 'submitted'
    | 'resubmitted'
    | 'step_approved'
    | 'step_signed'
    | 'step_rejected'
    | 'changes_requested'
    | 'approved'
    | 'cancelled'
    | 'step_pending'
    | 'step_waiting';
  /** Fecha del evento; en `step_pending`, desde cuándo espera; null en `step_waiting`. */
  readonly at: Date | null;
  readonly actorId: string | null;
  readonly comment: string | null;
  readonly stepName: string | null;
  readonly rule: 'any' | 'all' | null;
  readonly assigneeIds: readonly string[];
}

const ENTRY_VIEW = {
  submitted: { kind: 'submitted', state: 'done' },
  resubmitted: { kind: 'resubmitted', state: 'done' },
  step_approved: { kind: 'step_approved', state: 'done' },
  step_signed: { kind: 'step_signed', state: 'done' },
  step_rejected: { kind: 'rejected', state: 'stopped' },
  changes_requested: { kind: 'changes_requested', state: 'stopped' },
  approved: { kind: 'approved', state: 'done' },
  cancelled: { kind: 'cancelled', state: 'stopped' },
  step_pending: { kind: 'approval', state: 'pending' },
  step_waiting: { kind: 'approval', state: 'upcoming' },
} as const satisfies Record<
  ApprovalTimelineEntry['kind'],
  { readonly kind: TimelineKind; readonly state: TimelineState }
>;

/**
 * La línea de tiempo con el motor: «creada», los ítems de las rondas (hechos, el paso pendiente y
 * los que esperan) y la entrega. La entrega sigue como próxima mientras el documento puede
 * aprobarse o entregarse; rechazada y anulada terminan sin ella.
 */
export function buildTimeline(
  request: Pick<Request, 'status' | 'requesterId' | 'createdAt' | 'deliveredAt'>,
  entries: readonly ApprovalTimelineEntry[],
): TimelineItem[] {
  const items: TimelineItem[] = [item('created', 'done', request.createdAt, request.requesterId)];
  for (const entry of entries) {
    items.push({
      ...ENTRY_VIEW[entry.kind],
      at: entry.at,
      actorId: entry.actorId,
      comment: entry.comment,
      stepName: entry.stepName,
      rule: entry.rule,
      assigneeIds: entry.assigneeIds,
    });
  }
  switch (request.status) {
    case 'changes_requested':
      // Como en `deriveTimeline`: tras reenviar, vuelve la aprobación y luego la entrega.
      items.push(item('approval', 'upcoming', null), item('delivery', 'upcoming', null));
      break;
    case 'in_approval':
    case 'approved':
      items.push(item('delivery', 'upcoming', null));
      break;
    case 'delivered':
      items.push(item('delivery', 'done', request.deliveredAt));
      break;
    default:
      break;
  }
  return items;
}
