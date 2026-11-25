// Puertos de hojas de cálculo (E2-H3). Adaptadores: src/shared/adapters/spreadsheet-reader.ts y
// spreadsheet-writer.ts (read-excel-file, write-excel-file, papaparse y fflate).
//
// Los errores salen como ValidationError con `reason`: `file_unsupported` (no es .xlsx ni .csv),
// `file_unreadable` (dañado o ilegible) y `file_too_large` (supera los límites).

/** Límites de lectura (decisiones de la historia E2-H3). */
export const SPREADSHEET_LIMITS = {
  /** Tamaño del archivo subido. */
  maxFileBytes: 2 * 1024 * 1024,
  /** Entradas del zip de un .xlsx. */
  maxZipEntries: 100,
  /** Suma de lo que declaran las entradas del zip al descomprimir. */
  maxUncompressedBytes: 30 * 1024 * 1024,
  /** Las celdas más largas se cortan a este largo (así fallan la validación sin ocupar memoria). */
  maxCellChars: 1001,
  /** Columnas que se leen por fila. */
  maxColumns: 30,
} as const;

/** Todo se lee como texto; null = celda vacía. */
export type SpreadsheetCell = string | null;
export type SpreadsheetRow = readonly SpreadsheetCell[];

export interface SpreadsheetFile {
  /** Nombre original: su extensión (.xlsx o .csv) decide el tipo, junto con los bytes. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface SpreadsheetReader {
  /**
   * Primera hoja (o el CSV completo) como filas de texto. La fila `i` del resultado es la fila
   * `i + 1` de la hoja: las filas vacías intermedias se conservan para no perder la numeración.
   * Las filas vacías al final pueden venir o no. Las fórmulas se leen por su valor guardado.
   */
  readFirstSheet(file: SpreadsheetFile): Promise<readonly SpreadsheetRow[]>;
}

export interface SpreadsheetSheet {
  readonly name: string;
  /** La primera fila es el encabezado (se escribe en negrita). */
  readonly rows: readonly (readonly string[])[];
  /** Columnas (desde 0) con formato de texto, para no perder ceros a la izquierda de los códigos. */
  readonly textColumns?: readonly number[];
  /** Ancho por columna, en caracteres. */
  readonly widths?: readonly number[];
}

export interface SpreadsheetWriter {
  /** Libro .xlsx con las hojas dadas. */
  writeWorkbook(sheets: readonly SpreadsheetSheet[]): Promise<Uint8Array>;
}
