// Identificador de cada request: se acepta el de la cabecera si es seguro para logs.
import type { IdGenerator } from './ports/id-generator';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function resolveRequestId(header: string | null | undefined, ids: IdGenerator): string {
  return header && SAFE_REQUEST_ID.test(header) ? header : ids.newId();
}
