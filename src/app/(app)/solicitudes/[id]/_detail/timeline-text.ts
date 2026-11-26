// Textos de la línea de tiempo del detalle (E4-H3), sin React: el título de cada ítem y la lista de
// aprobadores de un paso pendiente.
import type { TimelineItemView } from '@/modules/requests';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.detail.timeline;

type TitleSource = Pick<TimelineItemView, 'kind' | 'stepName'>;
type PendingSource = Pick<
  TimelineItemView,
  'stepName' | 'assigneeCount' | 'assigneeNames' | 'rule' | 'at'
>;

/**
 * El título del ítem. Los pasos llevan el nombre que escribió el administrador: «Aprobado por
 * Almacén» cuando lo cerraron, «Aprobación parcial · Almacén» si falta alguien (regla `all`) y
 * «Gerencia local» mientras esperan. Sin nombre (línea derivada de las fechas), el título genérico.
 */
export function stepTitle(item: TitleSource): string {
  if (item.stepName) {
    if (item.kind === 'step_approved') return t.approvedBy(item.stepName);
    if (item.kind === 'step_signed') return t.signedBy(item.stepName);
    if (item.kind === 'approval') return item.stepName;
  }
  return t.steps[item.kind];
}

/**
 * «Ruby o Sergio» cuando basta uno (`any`) y «Ruby y Sergio» cuando firman todos (`all`); sin regla
 * se usa la disyunción. Lista vacía: cadena vacía.
 */
export function assigneeList(names: readonly string[], rule: 'any' | 'all' | null): string {
  if (names.length === 0) return '';
  return new Intl.ListFormat('es-PE', {
    style: 'long',
    type: rule === 'all' ? 'conjunction' : 'disjunction',
  }).format(names);
}

/** Lo que dice un paso pendiente: un mensaje fijo, o los asignados y desde cuándo esperan. */
export type PendingHint =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'assignees'; readonly who: string; readonly since: string | null };

/**
 * «Sin aprobadores asignados» solo cuando el paso de verdad no tiene asignados. Con asignados sin
 * nombre visible, `who` queda vacío y solo se muestra desde cuándo esperan.
 */
export function pendingHint(item: PendingSource): PendingHint {
  const hints = t.hints;
  // Sin nombre de paso, la línea viene de las fechas del documento (sin motor).
  if (item.stepName === null) return { kind: 'message', text: hints.approvalPending };
  if (item.assigneeCount === 0) return { kind: 'message', text: hints.noApprovers };
  return {
    kind: 'assignees',
    who: assigneeList(item.assigneeNames, item.rule),
    since: item.at,
  };
}
