// Qué acciones del detalle del SOF funcionan hoy. Las demás se muestran deshabilitadas con la nota
// «Esta acción se habilita pronto.» hasta que las historias siguientes las conecten (E3-H5, E4 y
// E5-H1). Al conectar una, se agrega aquí.
import type { RequestAction } from '@/modules/requests';

export const IMPLEMENTED_ACTIONS: readonly RequestAction[] = ['edit_draft'];

/** Acciones que viven fuera del panel lateral: en la tarjeta de ítems y en la del documento. */
const ELSEWHERE: readonly RequestAction[] = ['correct_line', 'download_pdf'];

export function isImplemented(action: RequestAction): boolean {
  return IMPLEMENTED_ACTIONS.includes(action);
}

/** En solo lectura (ADR-006) ninguna acción de escritura se puede usar. */
export function isActionEnabled(action: RequestAction, readOnly: boolean): boolean {
  return isImplemented(action) && !readOnly;
}

/** Acciones del panel de la línea de tiempo, en el orden en que se dibujan. */
export function panelActions(actions: readonly RequestAction[]): RequestAction[] {
  return actions.filter((action) => !ELSEWHERE.includes(action));
}

/** La nota «se habilita pronto» aparece si el panel tiene alguna acción aún sin conectar. */
export function showsSoonNote(actions: readonly RequestAction[]): boolean {
  return panelActions(actions).some((action) => !isImplemented(action));
}

/** Id de la nota «se habilita pronto», a la que apuntan los botones deshabilitados. */
export const SOON_NOTE_ID = 'detail-soon-note';

/** El id de la nota si se muestra; undefined si no (para `aria-describedby`). */
export function soonNoteId(actions: readonly RequestAction[]): string | undefined {
  return showsSoonNote(actions) ? SOON_NOTE_ID : undefined;
}
