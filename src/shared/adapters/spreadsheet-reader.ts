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

/** Tope propio de las partes que la librería expande en memoria (cadenas compartidas y estilos). */
const ENTRY_LIMITS: Readonly<Record<string, number>> = {
  'xl/sharedStrings.xml': SPREADSHEET_LIMITS.maxSharedStringsBytes,
  'xl/styles.xml': SPREADSHEET_LIMITS.maxStylesBytes,
};

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
      const entryLimit = ENTRY_LIMITS[file.name] ?? SPREADSHEET_LIMITS.maxUncompressedBytes;
      let entryTotal = 0;
      pending.add(file.name);
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        total += chunk.length;
        entryTotal += chunk.length;
        if (total > SPREADSHEET_LIMITS.maxUncompressedBytes || entryTotal > entryLimit) {
          throw fail('file_too_large');
        }
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

const isSpace = (code: number) => code === 32 || code === 9 || code === 10 || code === 13;

/**
 * Recorre las etiquetas de apertura de un XML y entrega, para las de nombre local `wanted`, el texto
 * de sus atributos. Es un tokenizador propio y lineal (sin regex con retroceso): ignora el prefijo
 * del nombre (cualquier carácter salvo espacio, `/`, `>` y `:`), respeta comillas dobles y simples
 * dentro de la etiqueta (un `>` en un atributo no la cierra) y no confunde `<c:chart>` con `<c>`.
 * Comentarios y CDATA se tratan como texto: sus etiquetas también cuentan (es más estricto).
 * Una comilla sin cerrar es un archivo ilegible.
 */
function scanTags(
  xml: string,
  wanted: ReadonlySet<string>,
  onTag: (local: string, attrs: string) => void,
): void {
  const length = xml.length;
  let at = xml.indexOf('<');
  while (at !== -1) {
    let i = at + 1;
    const first = xml.charCodeAt(i);
    // `</…>`, `<!…`, `<?…` y fin de texto: no son etiquetas de apertura.
    if (Number.isNaN(first) || first === 47 || first === 33 || first === 63) {
      at = xml.indexOf('<', i);
      continue;
    }
    let colon = -1;
    while (i < length) {
      const code = xml.charCodeAt(i);
      if (isSpace(code) || code === 47 || code === 62) break;
      if (code === 58) colon = i;
      i += 1;
    }
    const local = xml.slice(colon === -1 ? at + 1 : colon + 1, i);
    if (!wanted.has(local)) {
      at = xml.indexOf('<', i);
      continue;
    }
    // Atributos hasta el `>` de cierre, saltando lo que va entre comillas.
    const attrsStart = i;
    let quote = 0;
    while (i < length) {
      const code = xml.charCodeAt(i);
      if (quote !== 0) {
        if (code === quote) quote = 0;
      } else if (code === 34 || code === 39) {
        quote = code;
      } else if (code === 62) {
        break;
      }
      i += 1;
    }
    if (quote !== 0) throw fail('file_unreadable');
    onTag(local, xml.slice(attrsStart, i));
    // Dentro de una etiqueta sin cerrar (`>` ausente) no hay más etiquetas.
    at = i < length ? xml.indexOf('<', i) : -1;
  }
}

/** Valores de TODOS los atributos `name` de la etiqueta (con o sin prefijo y espacios junto a `=`). */
function attrValues(attrs: string, name: string): string[] {
  const pattern = new RegExp(
    `(?:^|\\s)(?:[^\\s=:]+:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'g',
  );
  return [...attrs.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? '');
}

const ROW_REF = /^\d{1,10}$/;
const CELL_REF = /^([A-Za-z]{1,10})(\d{1,10})$/;

function parseRef(ref: string): { col: number; row: number } {
  const match = CELL_REF.exec(ref);
  if (!match) throw fail('file_unreadable');
  let col = 0;
  for (const letter of (match[1] ?? '').toUpperCase()) col = col * 26 + letter.charCodeAt(0) - 64;
  return { col, row: Number(match[2]) };
}

const EXTENT_TAGS: ReadonlySet<string> = new Set(['row', 'c', 'dimension']);

/**
 * Fila y columna máximas que referencia un XML con `sheetData` (dimension, <row r> y <c r>), sin
 * construir la hoja: así una celda suelta en XFD1048576 se rechaza antes de que la librería reserve
 * la hoja entera. Un `r` con entidades (`&#49;`) o con otro formato se rechaza como ilegible.
 */
function sheetExtent(xml: string): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  let currentRow = 0;
  let currentCol = 0;
  scanTags(xml, EXTENT_TAGS, (local, attrs) => {
    if (local === 'dimension') {
      for (const ref of attrValues(attrs, 'ref')) {
        for (const part of ref.split(':')) {
          const cell = parseRef(part);
          rows = Math.max(rows, cell.row);
          cols = Math.max(cols, cell.col);
        }
      }
    } else if (local === 'row') {
      const refs = attrValues(attrs, 'r');
      let row = currentRow + 1;
      if (refs.length > 0) {
        row = 0;
        for (const ref of refs) {
          if (!ROW_REF.test(ref)) throw fail('file_unreadable');
          row = Math.max(row, Number(ref));
        }
      }
      if (row < 1) throw fail('file_unreadable');
      currentRow = row;
      currentCol = 0;
      rows = Math.max(rows, row);
    } else {
      const refs = attrValues(attrs, 'r');
      if (refs.length === 0) {
        currentCol += 1;
      } else {
        currentCol = 0;
        for (const ref of refs) {
          const cell = parseRef(ref);
          currentCol = Math.max(currentCol, cell.col);
          rows = Math.max(rows, cell.row);
        }
      }
      cols = Math.max(cols, currentCol);
    }
  });
  return { rows, cols };
}

const tooLarge = () => fail('file_too_large');

/** Cuenta las etiquetas de nombre local `tag` y rechaza si pasan de `max`. */
function assertTagCount(xml: string, tag: string, max: number): void {
  let count = 0;
  scanTags(xml, new Set([tag]), () => {
    count += 1;
    if (count > max) throw tooLarge();
  });
}

/**
 * Revisa TODAS las entradas XML conservadas (salvo [Content_Types].xml y las relaciones), no solo la
 * hoja que la librería elegiría: así ninguna diferencia entre este análisis y el de read-excel-file
 * (prefijos, entidades, ids repetidos, hojas sin nombre) deja pasar una hoja dispersa. También acota
 * la cantidad de cadenas compartidas y de estilos, que la librería expande en memoria.
 */
function assertSheetBounds(files: Record<string, Uint8Array>): void {
  const maxRows = SPREADSHEET_LIMITS.maxDataRows + 1 + SPREADSHEET_LIMITS.emptyRowsMargin;
  for (const [path, data] of Object.entries(files)) {
    if (path === '[Content_Types].xml' || path.endsWith('.rels')) continue;
    const xml = TEXT.decode(data);
    if (path === 'xl/sharedStrings.xml') {
      assertTagCount(xml, 'si', SPREADSHEET_LIMITS.maxSharedStrings);
    } else if (path === 'xl/styles.xml') {
      assertTagCount(xml, 'xf', SPREADSHEET_LIMITS.maxCellStyles);
    }
    if (!xml.includes('sheetData')) continue;
    const { rows, cols } = sheetExtent(xml);
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

// Semáforo por proceso: pocas hojas a la vez, para que muchas subidas en paralelo no sumen memoria.
let activeReads = 0;
const waiting: (() => void)[] = [];

async function withReadSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeReads >= SPREADSHEET_LIMITS.maxConcurrentReads) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    activeReads += 1;
  }
  try {
    return await work();
  } finally {
    // El cupo pasa directo al siguiente en la cola (sin soltarlo) o se libera.
    const next = waiting.shift();
    if (next) next();
    else activeReads -= 1;
  }
}

export function createSpreadsheetReader(): SpreadsheetReader {
  return {
    async readFirstSheet(file) {
      if (file.bytes.byteLength > SPREADSHEET_LIMITS.maxFileBytes) throw fail('file_too_large');
      if (file.bytes.byteLength === 0) throw fail('file_unreadable');
      const kind = detectKind(file);
      try {
        return kind === 'xlsx'
          ? await withReadSlot(() => readXlsx(file.bytes))
          : readCsv(file.bytes);
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw fail('file_unreadable');
      }
    },
  };
}
