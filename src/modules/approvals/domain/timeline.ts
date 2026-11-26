// Línea de tiempo de la aprobación (E4-H3): une los eventos de todas las rondas con los pasos que
// siguen abiertos. Puro: sin base de datos. requests la dibuja (puerto ApprovalTimeline).
import type { InstanceStatus } from './approval-instance';
import type { StepRule } from './route-preview';

/** Lo que se dibuja: los eventos con hito propio y los pasos abiertos de la ronda vigente. */
export const TIMELINE_ENTRY_KINDS = [
  'submitted',
  'resubmitted',
  'step_approved',
  'step_rejected',
  'changes_requested',
  'approved',
  'cancelled',
  'step_pending',
  'step_waiting',
] as const;
export type TimelineEntryKind = (typeof TIMELINE_ENTRY_KINDS)[number];

export interface ApprovalTimelineEntry {
  readonly kind: TimelineEntryKind;
  /** Fecha del evento; en `step_pending`, desde cuándo espera; null en `step_waiting`. */
  readonly at: Date | null;
  readonly actorId: string | null;
  readonly comment: string | null;
  /** Nombre del paso tal como lo escribió el admin; null en los eventos que no son de un paso. */
  readonly stepName: string | null;
  readonly rule: StepRule | null;
  /** Solo en `step_pending`: los asignados con usuario que aún no deciden. */
  readonly assigneeIds: readonly string[];
}

/** Un `approval_events` con el nombre y la regla de su paso (left join). */
export interface TimelineEventRow {
  readonly id: string;
  readonly type: string;
  readonly actorUserId: string | null;
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly stepName: string | null;
  readonly stepRule: StepRule | null;
}

/** Un paso `pending` o `waiting` de la ronda vigente. */
export interface OpenStepRow {
  readonly order: number;
  readonly name: string;
  readonly rule: StepRule;
  readonly status: 'pending' | 'waiting';
  readonly pendingSince: Date | null;
  /** Asignados con usuario que aún no deciden. */
  readonly assigneeIds: readonly string[];
}

export interface ApprovalTimelineSource {
  /** Estado de la última ronda. */
  readonly instanceStatus: InstanceStatus;
  readonly events: readonly TimelineEventRow[];
  readonly openSteps: readonly OpenStepRow[];
}

const DRAWN: ReadonlySet<string> = new Set<TimelineEntryKind>([
  'submitted',
  'resubmitted',
  'step_approved',
  'step_rejected',
  'changes_requested',
  'approved',
  'cancelled',
]);

const isDrawn = (type: string): type is TimelineEntryKind => DRAWN.has(type);

/**
 * Un ítem por evento, en orden de `created_at` y `id`; al final, el paso pendiente y los que
 * esperan, solo si la ronda sigue en curso. `step_pending` no se dibuja como evento (lo cubre el
 * paso abierto) y los tipos desconocidos se ignoran.
 */
export function buildApprovalTimeline(source: ApprovalTimelineSource): ApprovalTimelineEntry[] {
  const events = [...source.events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const entries: ApprovalTimelineEntry[] = [];
  for (const event of events) {
    if (!isDrawn(event.type)) continue;
    entries.push({
      kind: event.type,
      at: event.createdAt,
      actorId: event.actorUserId,
      comment: event.comment,
      stepName: event.stepName,
      rule: event.stepRule,
      assigneeIds: [],
    });
  }
  if (source.instanceStatus !== 'in_progress') return entries;

  const open = [...source.openSteps].sort((a, b) => a.order - b.order);
  for (const step of open) {
    entries.push({
      kind: step.status === 'pending' ? 'step_pending' : 'step_waiting',
      at: step.status === 'pending' ? step.pendingSince : null,
      actorId: null,
      comment: null,
      stepName: step.name,
      rule: step.rule,
      assigneeIds: step.status === 'pending' ? step.assigneeIds : [],
    });
  }
  return entries;
}
