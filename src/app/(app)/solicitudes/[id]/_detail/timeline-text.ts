// Textos de la línea de tiempo del detalle (E4-H3), sin React: el título de cada ítem y la lista de
// aprobadores de un paso pendiente.
import type { TimelineItemView } from '@/modules/requests';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.detail.timeline;

type TitleSource = Pick<TimelineItemView, 'kind' | 'stepName'>;

/**
 * El título del ítem. Los pasos llevan el nombre que escribió el administrador: «Aprobado por
 * Almacén» cuando lo firmaron y «Gerencia local» mientras esperan. Sin nombre (línea derivada de
 * las fechas), el título genérico.
 */
export function stepTitle(item: TitleSource): string {
  if (item.stepName) {
    if (item.kind === 'step_approved') return t.approvedBy(item.stepName);
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
