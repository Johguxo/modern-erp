// Leer el archivo de una importación (E2-H3, catalog.manage): lo hace la capa web ANTES de abrir la
// transacción (leer y descomprimir es trabajo de CPU y memoria que no debe retener una conexión).
// El ctx llega porque el permiso se vuelve a revisar aquí; el archivo no toca la base de datos.
import type { Ctx } from '@/shared/context';
import type { SpreadsheetReader } from '@/shared/ports/spreadsheet';

import { extractRows, type ImportKind, type ImportRow } from '../domain/import';

import { requireCatalogWrite } from './master-data';

export interface ImportFileInput {
  readonly kind: ImportKind;
  /** Nombre original: su extensión decide si es .xlsx o .csv. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Filas de datos ya extraídas del archivo: lo que reciben la vista previa y la creación del job. */
export interface ImportRowsInput {
  readonly kind: ImportKind;
  readonly rows: readonly ImportRow[];
}

/** Lee la primera hoja y devuelve las filas de datos (ValidationError con `reason` si no sirve). */
export async function readImportRows(
  ctx: Ctx,
  input: ImportFileInput,
  deps: { readonly reader: SpreadsheetReader },
): Promise<ImportRow[]> {
  requireCatalogWrite(ctx);
  const sheet = await deps.reader.readFirstSheet({ name: input.name, bytes: input.bytes });
  return extractRows(sheet, input.kind);
}
