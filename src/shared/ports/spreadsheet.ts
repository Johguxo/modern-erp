// Puertos de hojas de cálculo (E2-H3). Adaptadores: src/shared/adapters/spreadsheet-reader.ts y
// spreadsheet-writer.ts (read-excel-file, write-excel-file, papaparse y fflate).
//
// Los errores salen como ValidationError con `reason`: `file_unsupported` (no es .xlsx ni .csv),
// `file_unreadable` (dañado o ilegible), `file_too_large` (supera los límites), `too_many_columns`
// y `too_many_rows` (params.max; el dominio del catálogo usa el mismo motivo).

/** Límites de lectura (decisiones de la historia E2-H3). */
export const SPREADSHEET_LIMITS = {
  /** Tamaño del archivo subido. */
  maxFileBytes: 2 * 1024 * 1024,
  /** Entradas del zip de un .xlsx. */
  maxZipEntries: 100,
  /** Bytes REALES descomprimidos de las entradas XML del zip (se cuentan al descomprimir). */
  // Medido: una plantilla de productos (6 columnas) con 5,000 filas de textos largos de ~150
  // caracteres descomprime a 5.5 MB (sharedStrings 4.2 MB, hoja 1.3 MB, styles < 1 KB): el tope
  // total deja ~2x de margen y los de sharedStrings/styles dejan ~2x y holgura para libros con formato.
  maxUncompressedBytes: 12 * 1024 * 1024,
  /** xl/sharedStrings.xml descomprimido (la librería lo expande entero en memoria). */
  maxSharedStringsBytes: 8 * 1024 * 1024,
  /** xl/styles.xml descomprimido. */
  maxStylesBytes: 2 * 1024 * 1024,
  /** Cadenas compartidas (<si>): 5,000 filas x 30 columnas + margen. */
  maxSharedStrings: 5000 * 30 + 10_000,
  /** Estilos de celda (<xf>). */
  maxCellStyles: 10_000,
  /** Hojas que se leen a la vez por proceso (cada lectura puede ocupar decenas de MB). */
  maxConcurrentReads: 2,
  /** Las celdas más largas se cortan a este largo (así fallan la validación sin ocupar memoria). */
  maxCellChars: 1001,
  /** Columnas que puede tener la hoja (más se rechazan antes de leerla). */
  maxColumns: 30,
  /** Filas de datos por archivo (igual a IMPORT_LIMITS.maxRows del catálogo). */
  maxDataRows: 5000,
  /** Filas vacías de más que se toleran al final de una hoja (formato sin datos). */
  emptyRowsMargin: 100,
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
