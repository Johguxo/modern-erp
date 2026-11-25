// Adaptador SpreadsheetReader (E2-H3): lee la primera hoja de un .xlsx (read-excel-file) o un .csv
// (papaparse) como filas de texto. Antes de leer revisa el tamaño y los bytes iniciales; el .xlsx
// se descomprime aquí en streaming (fflate) contando los bytes reales, se acota la hoja (filas y
// columnas) y solo entonces se le pasa a la librería un zip reconstruido con las entradas XML
// verificadas. Nunca evalúa fórmulas ni macros. El contenido del archivo no se registra en logs:
// los errores solo llevan un `reason`.
import Decimal from 'decimal.js';
import { Unzip, UnzipInflate, UnzipPassThrough, zipSync } from 'fflate';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';

import { ValidationError } from '../errors';
import {
  SPREADSHEET_LIMITS,
  type SpreadsheetCell,
  type SpreadsheetFile,
  type SpreadsheetReader,
  type SpreadsheetRow,
} from '../ports/spreadsheet';

// Sin `cause`: el error de la librería puede citar texto del archivo y el contenido no va a los logs.
const fail = (
  reason: 'file_unsupported' | 'file_unreadable' | 'file_too_large' | 'too_many_columns',
) => new ValidationError({ reason, message: `Spreadsheet rejected: ${reason}` });

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

/** Entradas que se conservan: solo XML y relaciones (sin imágenes, macros ni binarios). */
const isKeptEntry = (name: string) => name.endsWith('.xml') || name.endsWith('.rels');

/** Trozos de entrada por `push`: acotan lo que una sola llamada puede expandir (≈1000:1 máx.). */
const PUSH_SLICE_BYTES = 4096;

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/**
 * Descomprime el .xlsx en streaming con fflate y cuenta los bytes REALES que salen (no los que
 * declara el zip, que pueden mentir). Aborta con file_too_large en cuanto el total real supera el
 * límite o hay demasiadas entradas. Solo se descomprimen las entradas XML/rels; el resto ni se
 * inicia. Devuelve únicamente esas entradas verificadas.
 */
function unpackXlsx(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const pending = new Set<string>();
  let entries = 0;
  let total = 0;
  try {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    unzip.onfile = (file) => {
      entries += 1;
      if (entries > SPREADSHEET_LIMITS.maxZipEntries) throw fail('file_too_large');
      if (!isKeptEntry(file.name)) return; // sin start(): no se descomprime
      const chunks: Uint8Array[] = [];
      pending.add(file.name);
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        total += chunk.length;
        if (total > SPREADSHEET_LIMITS.maxUncompressedBytes) throw fail('file_too_large');
        chunks.push(chunk.slice());
        if (final) {
          files[file.name] = concat(chunks);
          pending.delete(file.name);
        }
      };
      file.start();
    };
    for (let offset = 0; offset < bytes.length; offset += PUSH_SLICE_BYTES) {
      const end = Math.min(offset + PUSH_SLICE_BYTES, bytes.length);
      unzip.push(bytes.subarray(offset, end), end === bytes.length);
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw fail('file_unreadable');
  }
  // Una entrada que no terminó (zip truncado) o ninguna entrada útil: archivo dañado.
  if (pending.size > 0 || Object.keys(files).length === 0) throw fail('file_unreadable');
  return files;
}

const TEXT = new TextDecoder('utf-8');

/** Valor de un atributo XML (comillas dobles o simples) dentro de una etiqueta. */
function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match ? (match[1] ?? match[2]) : undefined;
}

/** Hojas (rutas dentro del zip) que hay que acotar: la primera según el libro, o todas si no se resuelve. */
function sheetPathsToCheck(files: Record<string, Uint8Array>): string[] {
  const all = Object.keys(files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name));
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!workbook || !rels) return all;
  // Igual que read-excel-file: la primera <sheet> del libro, su r:id y la relación de tipo worksheet.
  const firstSheet = /<(?:\w+:)?sheet\b[^>]*>/.exec(TEXT.decode(workbook))?.[0];
  const relId = firstSheet ? /\s\w+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(firstSheet) : null;
  const id = relId ? (relId[1] ?? relId[2]) : undefined;
  if (id === undefined) return all;
  for (const tag of TEXT.decode(rels).match(/<Relationship\b[^>]*>/g) ?? []) {
    if (attr(tag, 'Id') !== id || !(attr(tag, 'Type') ?? '').endsWith('/worksheet')) continue;
    const target = attr(tag, 'Target');
    if (!target) break;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    return path in files ? [path] : all;
  }
  return all;
}

const CELL_REF = /^([A-Za-z]{1,10})(\d{1,10})$/;

function parseRef(ref: string): { col: number; row: number } {
  const match = CELL_REF.exec(ref);
  if (!match) throw fail('file_unreadable');
  let col = 0;
  for (const letter of (match[1] ?? '').toUpperCase()) col = col * 26 + letter.charCodeAt(0) - 64;
  return { col, row: Number(match[2]) };
}

/**
 * Fila y columna máximas que referencia una hoja (dimension, <row r> y <c r>), sin construirla:
 * así una celda suelta en XFD1048576 se rechaza antes de que la librería reserve la hoja entera.
 */
function sheetExtent(xml: string): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  const dimension = /<(?:\w+:)?dimension\b[^>]*>/.exec(xml)?.[0];
  const ref = dimension ? attr(dimension, 'ref') : undefined;
  if (ref) {
    for (const part of ref.split(':')) {
      const cell = parseRef(part);
      rows = Math.max(rows, cell.row);
      cols = Math.max(cols, cell.col);
    }
  }
  let currentRow = 0;
  let currentCol = 0;
  for (const match of xml.matchAll(/<(?:\w+:)?(row|c)\b[^>]*>/g)) {
    const tag = match[0];
    if (match[1] === 'row') {
      const r = attr(tag, 'r');
      currentRow = r === undefined ? currentRow + 1 : Number(r);
      if (!Number.isInteger(currentRow) || currentRow < 1) throw fail('file_unreadable');
      currentCol = 0;
      rows = Math.max(rows, currentRow);
    } else {
      const r = attr(tag, 'r');
      if (r === undefined) {
        currentCol += 1;
      } else {
        const cell = parseRef(r);
        currentCol = cell.col;
        rows = Math.max(rows, cell.row);
      }
      cols = Math.max(cols, currentCol);
    }
  }
  return { rows, cols };
}

/** Rechaza hojas con filas o columnas lejanas antes de dárselas a read-excel-file. */
function assertSheetBounds(files: Record<string, Uint8Array>): void {
  const maxRows = SPREADSHEET_LIMITS.maxDataRows + 1 + SPREADSHEET_LIMITS.emptyRowsMargin;
  for (const path of sheetPathsToCheck(files)) {
    const { rows, cols } = sheetExtent(TEXT.decode(files[path]));
    if (rows > maxRows) {
      throw new ValidationError({
        reason: 'too_many_rows',
        params: { max: SPREADSHEET_LIMITS.maxDataRows },
        message: 'Spreadsheet has too many rows',
      });
    }
    if (cols > SPREADSHEET_LIMITS.maxColumns) throw fail('too_many_columns');
  }
}

const NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Número de Excel como texto decimal exacto: sin exponente y a 15 cifras significativas (Excel
 * guarda 19.99 como 19.989999999999998). Lo que no es un número normal queda como está.
 */
function numberText(text: string): string {
  if (!NUMBER_TEXT.test(text)) return text;
  const exponent = /[eE]([+-]?\d+)/.exec(text)?.[1];
  if (exponent !== undefined && Math.abs(Number(exponent)) > 30) return text;
  return new Decimal(text).toSignificantDigits(15).toFixed();
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
  const files = unpackXlsx(bytes);
  assertSheetBounds(files);
  const verified = zipSync(files, { level: 0 });
  try {
    // parseNumber entrega el texto decimal exacto (sin pasar por number): sin redondeos de punto
    // flotante en los precios.
    const sheet = await readSheet(Buffer.from(verified), { parseNumber: numberText });
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

/** Primera línea con texto, sin partir todo el archivo en líneas (puede tener millones). */
function firstNonBlankLine(text: string): string {
  let start = 0;
  while (start < text.length) {
    let end = start;
    while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end += 1;
    const line = text.slice(start, end);
    if (line.trim() !== '') return line;
    start = end + 1;
  }
  return '';
}

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * Delimitador según el encabezado (primera línea con texto): el que más aparece fuera de comillas;
 * coma si no hay ninguno. Papaparse lo adivina mal si el archivo termina con salto de línea.
 */
function detectDelimiter(text: string): string {
  const header = firstNonBlankLine(text);
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

/** Encabezado + filas de datos + margen de líneas vacías al final. */
const CSV_MAX_LINES = SPREADSHEET_LIMITS.maxDataRows + 1 + 1000;

function readCsv(bytes: Uint8Array): SpreadsheetRow[] {
  const text = decodeCsv(bytes);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    // Las filas vacías se conservan para no perder la numeración de las filas.
    skipEmptyLines: false,
    // Tope físico de líneas: un CSV de millones de saltos de línea no se parsea completo.
    preview: CSV_MAX_LINES,
  });
  if (parsed.data.length >= CSV_MAX_LINES) {
    throw new ValidationError({
      reason: 'too_many_rows',
      params: { max: SPREADSHEET_LIMITS.maxDataRows },
      message: 'Spreadsheet has too many rows',
    });
  }
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
