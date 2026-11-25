// Adaptador SpreadsheetReader (E2-H3): lee la primera hoja de un .xlsx (read-excel-file) o un .csv
// (papaparse) como filas de texto. Antes de leer revisa el tamaño, los bytes iniciales y el zip
// (fflate) contra zip bombs. Nunca evalúa fórmulas ni macros. El contenido del archivo no se
// registra en logs: los errores solo llevan un `reason`.
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';
import { unzipSync } from 'fflate';

import { ValidationError } from '../errors';
import {
  SPREADSHEET_LIMITS,
  type SpreadsheetCell,
  type SpreadsheetFile,
  type SpreadsheetReader,
  type SpreadsheetRow,
} from '../ports/spreadsheet';

// Sin `cause`: el error de la librería puede citar texto del archivo y el contenido no va a los logs.
const fail = (reason: 'file_unsupported' | 'file_unreadable' | 'file_too_large') =>
  new ValidationError({ reason, message: `Spreadsheet rejected: ${reason}` });

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
/** Cabecera de los archivos antiguos .xls (OLE2): se rechazan aunque lleven otra extensión. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0] as const;

type Kind = 'xlsx' | 'csv';

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

/** Tipo según extensión y bytes; lanza file_unsupported si no es un .xlsx ni un .csv. */
function detectKind(file: SpreadsheetFile): Kind {
  const name = file.name.toLowerCase();
  if (startsWith(file.bytes, OLE2_MAGIC)) throw fail('file_unsupported');
  if (name.endsWith('.xlsx')) {
    if (!startsWith(file.bytes, ZIP_MAGIC)) throw fail('file_unsupported');
    return 'xlsx';
  }
  if (name.endsWith('.csv')) {
    // Un CSV es texto: un zip o bytes nulos delatan otro tipo de archivo.
    if (startsWith(file.bytes, ZIP_MAGIC) || file.bytes.includes(0)) throw fail('file_unsupported');
    return 'csv';
  }
  throw fail('file_unsupported');
}

/** Revisa lo que el zip declara (entradas y tamaño descomprimido) sin descomprimir nada. */
function inspectZip(bytes: Uint8Array): void {
  let entries = 0;
  let declared = 0;
  try {
    unzipSync(bytes, {
      filter: (info) => {
        entries += 1;
        declared += info.originalSize;
        if (
          entries > SPREADSHEET_LIMITS.maxZipEntries ||
          declared > SPREADSHEET_LIMITS.maxUncompressedBytes
        ) {
          throw fail('file_too_large');
        }
        return false;
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw fail('file_unreadable');
  }
}

function toText(value: unknown): SpreadsheetCell {
  if (value === null || value === undefined) return null;
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'string') text = value.trim();
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else return null;
  if (text === '') return null;
  return text.length > SPREADSHEET_LIMITS.maxCellChars
    ? text.slice(0, SPREADSHEET_LIMITS.maxCellChars)
    : text;
}

function toRow(cells: readonly unknown[]): SpreadsheetRow {
  return cells.slice(0, SPREADSHEET_LIMITS.maxColumns).map(toText);
}

async function readXlsx(bytes: Uint8Array): Promise<SpreadsheetRow[]> {
  inspectZip(bytes);
  try {
    // parseNumber devuelve el texto tal como está en el archivo: sin pasar por number (sin
    // redondeos de punto flotante en los precios).
    const sheet = await readSheet(Buffer.from(bytes), { parseNumber: (text) => text });
    return sheet.map((row) => toRow(row));
  } catch {
    throw fail('file_unreadable');
  }
}

/** UTF-8 estricto; si el texto no es UTF-8 válido, windows-1252 (Excel en español). Sin BOM. */
function decodeCsv(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * Delimitador según el encabezado (primera línea con texto): el que más aparece fuera de comillas;
 * coma si no hay ninguno. Papaparse lo adivina mal si el archivo termina con salto de línea.
 */
function detectDelimiter(text: string): string {
  const header = text.split(/\r\n|\n|\r/).find((line) => line.trim() !== '') ?? '';
  const unquoted = header.replace(/"[^"]*"/g, '');
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = unquoted.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function readCsv(bytes: Uint8Array): SpreadsheetRow[] {
  const text = decodeCsv(bytes);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    // Las filas vacías se conservan para no perder la numeración de las filas.
    skipEmptyLines: false,
  });
  // Solo se descartan los errores que impiden leer; "TooFewFields" y similares son tolerables.
  if (parsed.errors.some((error) => error.type === 'Quotes')) throw fail('file_unreadable');
  return parsed.data.map((row) => toRow(row));
}

export function createSpreadsheetReader(): SpreadsheetReader {
  return {
    async readFirstSheet(file) {
      if (file.bytes.byteLength > SPREADSHEET_LIMITS.maxFileBytes) throw fail('file_too_large');
      if (file.bytes.byteLength === 0) throw fail('file_unreadable');
      const kind = detectKind(file);
      try {
        return kind === 'xlsx' ? await readXlsx(file.bytes) : readCsv(file.bytes);
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw fail('file_unreadable');
      }
    },
  };
}
