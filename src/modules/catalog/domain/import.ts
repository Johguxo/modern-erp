// Importación masiva del catálogo (E2-H3): columnas reconocidas, encabezados normalizados y filas
// de datos a partir de una hoja ya leída como texto. Sin librerías de Excel: el adaptador
// SpreadsheetReader entrega `string | null` por celda.
import { ValidationError } from '@/shared/errors';

/** `stock` (E6-H2) usará el mismo patrón; hoy solo existen estos dos tipos. */
export const IMPORT_KINDS = ['products', 'equipment'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_LIMITS = {
  /** Filas de datos por archivo (sin contar el encabezado ni las filas vacías). */
  maxRows: 5000,
  /** Filas que muestra la vista previa. */
  previewRows: 20,
  /** Errores que se guardan en el trabajo (el resumen cuenta todos). */
  maxStoredErrors: 500,
  /** Tamaño del payload JSON del trabajo. */
  maxPayloadBytes: 5 * 1024 * 1024,
  /** Filas por INSERT … ON CONFLICT del worker. */
  batchSize: 500,
} as const;

export interface ColumnSpec {
  /** Clave del valor en la fila importada (el nombre del campo del contrato). */
  readonly key: string;
  readonly required: boolean;
  /** Encabezados válidos ya normalizados (normalizeHeader). El primero es el de la plantilla. */
  readonly aliases: readonly string[];
  /** Encabezado tal como lo muestra la plantilla. */
  readonly header: string;
}

export const PRODUCT_COLUMNS: readonly ColumnSpec[] = [
  { key: 'code', required: true, header: 'Código', aliases: ['codigo', 'code'] },
  { key: 'name', required: true, header: 'Nombre', aliases: ['nombre', 'name'] },
  { key: 'unit', required: true, header: 'Unidad', aliases: ['unidad', 'unit'] },
  { key: 'category', required: false, header: 'Categoría', aliases: ['categoria', 'category'] },
  {
    key: 'price',
    required: false,
    header: 'Precio referencial',
    aliases: ['precio referencial', 'precio', 'precio_referencial', 'price'],
  },
  { key: 'currency', required: false, header: 'Moneda', aliases: ['moneda', 'currency'] },
];

export const EQUIPMENT_COLUMNS: readonly ColumnSpec[] = [
  { key: 'code', required: true, header: 'Código', aliases: ['codigo', 'code'] },
  { key: 'name', required: true, header: 'Nombre', aliases: ['nombre', 'name'] },
  { key: 'type', required: false, header: 'Tipo', aliases: ['tipo', 'type'] },
];

export function columnsOf(kind: ImportKind): readonly ColumnSpec[] {
  return kind === 'products' ? PRODUCT_COLUMNS : EQUIPMENT_COLUMNS;
}

/** Minúsculas, sin tildes, espacios y asteriscos de «obligatorio» recortados y colapsados. */
export function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ColumnIndex = Readonly<Record<string, number>>;

/** Una fila de datos: `row` es el número de la hoja (el encabezado es la fila 1). */
export interface ImportRow {
  readonly row: number;
  /** Valor de cada columna conocida; null si falta o está vacío. */
  readonly values: Readonly<Record<string, string | null>>;
}

/** Posición de cada columna reconocida en el encabezado (la primera si se repite) y las que faltan. */
export function mapColumns(
  header: readonly (string | null)[],
  specs: readonly ColumnSpec[],
): { index: ColumnIndex; missing: string[] } {
  const normalized = header.map((cell) => (cell === null ? '' : normalizeHeader(cell)));
  const index: Record<string, number> = {};
  const missing: string[] = [];
  for (const spec of specs) {
    const position = normalized.findIndex((cell) => spec.aliases.includes(cell));
    if (position >= 0) index[spec.key] = position;
    else if (spec.required) missing.push(spec.header);
  }
  return { index, missing };
}

const isBlank = (row: readonly (string | null)[]) => row.every((cell) => cell === null);

/**
 * Filas de datos de la hoja: la fila 1 es el encabezado; las filas vacías se saltan sin perder la
 * numeración (la fila 5 del archivo sigue siendo la 5). Lanza ValidationError con `reason`:
 * `missing_columns` (params.columns), `no_rows` o `too_many_rows` (params.max).
 */
export function extractRows(
  sheet: readonly (readonly (string | null)[])[],
  kind: ImportKind,
): ImportRow[] {
  const specs = columnsOf(kind);
  const { index, missing } = mapColumns(sheet[0] ?? [], specs);
  if (missing.length > 0) {
    throw new ValidationError({
      reason: 'missing_columns',
      params: { columns: missing.join(', ') },
      message: `Import file is missing required columns: ${missing.join(', ')}`,
    });
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < sheet.length; i += 1) {
    const cells = sheet[i] ?? [];
    if (isBlank(cells)) continue;
    const values: Record<string, string | null> = {};
    for (const spec of specs) {
      const position = index[spec.key];
      values[spec.key] = position === undefined ? null : (cells[position] ?? null);
    }
    rows.push({ row: i + 1, values });
    if (rows.length > IMPORT_LIMITS.maxRows) {
      throw new ValidationError({
        reason: 'too_many_rows',
        params: { max: IMPORT_LIMITS.maxRows },
        message: `Import file has more than ${IMPORT_LIMITS.maxRows} rows`,
      });
    }
  }
  if (rows.length === 0) {
    throw new ValidationError({ reason: 'no_rows', message: 'Import file has no data rows' });
  }
  return rows;
}
