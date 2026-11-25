// Hojas de cálculo del proceso web (E2-H3): adaptadores de lectura y escritura, y la lectura segura
// de un archivo subido por FormData.
import { createSpreadsheetReader } from '@/shared/adapters/spreadsheet-reader';
import { createSpreadsheetWriter } from '@/shared/adapters/spreadsheet-writer';
import { ValidationError } from '@/shared/errors';
import {
  SPREADSHEET_LIMITS,
  type SpreadsheetReader,
  type SpreadsheetWriter,
} from '@/shared/ports/spreadsheet';

let reader: SpreadsheetReader | undefined;
let writer: SpreadsheetWriter | undefined;

export function getSpreadsheetReader(): SpreadsheetReader {
  reader ??= createSpreadsheetReader();
  return reader;
}

export function getSpreadsheetWriter(): SpreadsheetWriter {
  writer ??= createSpreadsheetWriter();
  return writer;
}

/** Bytes del archivo subido; revisa el tamaño ANTES de leerlo a memoria. */
export async function readUpload(file: File): Promise<{ name: string; bytes: Uint8Array }> {
  if (file.size > SPREADSHEET_LIMITS.maxFileBytes) {
    throw new ValidationError({
      reason: 'file_too_large',
      message: `Upload too large (${file.size} bytes)`,
    });
  }
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
