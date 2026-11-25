// Textos de los errores por fila de la importación (E2-H3): la `reason` viene del servidor como una
// clave y aquí se traduce a es-PE junto con el nombre de la columna.
import type { RowError } from '@/modules/catalog/contracts';
import { messages } from '@/ui/messages/es-PE';

const t = messages.catalog.importer;
type Reasons = typeof t.rowReasons;
type Fields = typeof t.fields;

export function fieldLabel(field: string | null): string | null {
  return field !== null && Object.hasOwn(t.fields, field) ? t.fields[field as keyof Fields] : field;
}

/** «es obligatorio.», «usa punto decimal…»: se antepone el nombre de la columna al mostrarlo. */
export function reasonText(error: Pick<RowError, 'reason' | 'params'>): string {
  const key = Object.hasOwn(t.rowReasons, error.reason)
    ? (error.reason as keyof Reasons)
    : 'invalid';
  return t.rowReasons[key](error.params);
}

/** «Código: es obligatorio.» (con el nombre de la columna, si el error es de una columna). */
export function errorSentence(error: RowError): string {
  const label = fieldLabel(error.field);
  const reason = reasonText(error);
  return label ? `${label}: ${reason}` : reason;
}
