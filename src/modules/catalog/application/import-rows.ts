// Validación fila por fila de una importación (E2-H3): reglas Zod de los contratos, un error por
// campo con una clave `reason` que traduce la UI, y detección de códigos repetidos en el archivo.
import type { z } from 'zod';

import { equipmentRowSchema, productRowSchema, type RowError } from '../contracts/import';
import type { ImportKind, ImportRow } from '../domain/import';
import type { Currency } from '../domain/money';

import type { EquipmentFields, ProductFields } from './ports';

export type ProductUpsertRow = ProductFields & { readonly code: string };
export type EquipmentUpsertRow = EquipmentFields & { readonly code: string };

export interface ImportValidation<R> {
  /** Filas válidas y sin repetir, listas para el upsert (en el orden del archivo). */
  readonly valid: R[];
  /** Todos los errores, en orden de fila. */
  readonly errors: RowError[];
  /** Filas con al menos un error. */
  readonly failedRows: number;
}

/** Clave del mensaje (messages.catalog.importer.rowReasons) según el problema de Zod. */
function reasonOf(
  field: string,
  issue: z.core.$ZodIssue,
): { reason: string; params: Record<string, string | number> } {
  switch (issue.code) {
    case 'too_big':
      return { reason: 'too_long', params: { max: Number(issue.maximum) } };
    case 'too_small':
    case 'invalid_type':
      return { reason: 'required', params: {} };
    case 'invalid_format':
      if (field === 'code') return { reason: 'invalid_code', params: {} };
      if (field === 'price') return { reason: 'invalid_price', params: {} };
      return { reason: 'invalid', params: {} };
    case 'invalid_value':
      return { reason: field === 'currency' ? 'invalid_currency' : 'invalid', params: {} };
    case 'custom':
      return { reason: issue.message, params: {} };
    default:
      return { reason: 'invalid', params: {} };
  }
}

function rawCode(row: ImportRow): string | null {
  const code = row.values.code?.trim();
  return code ? code.slice(0, 40) : null;
}

/** Un error por campo (el primero que falló), en el orden en que Zod los reporta. */
function rowErrors(row: ImportRow, issues: readonly z.core.$ZodIssue[]): RowError[] {
  const code = rawCode(row);
  const seen = new Set<string>();
  const errors: RowError[] = [];
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : null;
    const key = field ?? '';
    if (seen.has(key)) continue;
    seen.add(key);
    const { reason, params } = reasonOf(key, issue);
    errors.push({ row: row.row, code, field, reason, params });
  }
  return errors;
}

type Options = { readonly defaultCurrency: Currency };

/**
 * Valida todas las filas. Un código repetido en el archivo (sin importar mayúsculas) da
 * `duplicate_in_file` con `firstRow`: gana la primera aparición y las demás no se importan.
 */
export function validateImportRows(
  kind: 'products',
  rows: readonly ImportRow[],
  options: Options,
): ImportValidation<ProductUpsertRow>;
export function validateImportRows(
  kind: 'equipment',
  rows: readonly ImportRow[],
  options: Options,
): ImportValidation<EquipmentUpsertRow>;
export function validateImportRows(
  kind: ImportKind,
  rows: readonly ImportRow[],
  options: Options,
): ImportValidation<ProductUpsertRow> | ImportValidation<EquipmentUpsertRow>;
export function validateImportRows(
  kind: ImportKind,
  rows: readonly ImportRow[],
  options: Options,
): ImportValidation<ProductUpsertRow> | ImportValidation<EquipmentUpsertRow> {
  const productSchema = productRowSchema(options.defaultCurrency);
  const firstRowByCode = new Map<string, number>();
  const validProducts: ProductUpsertRow[] = [];
  const validEquipment: EquipmentUpsertRow[] = [];
  const errors: RowError[] = [];
  let failedRows = 0;

  for (const row of rows) {
    const code = rawCode(row)?.toUpperCase() ?? null;
    if (code !== null) {
      const first = firstRowByCode.get(code);
      if (first !== undefined) {
        failedRows += 1;
        errors.push({
          row: row.row,
          code,
          field: 'code',
          reason: 'duplicate_in_file',
          params: { firstRow: first },
        });
        continue;
      }
      firstRowByCode.set(code, row.row);
    }

    if (kind === 'products') {
      const parsed = productSchema.safeParse(row.values);
      if (parsed.success) validProducts.push(parsed.data);
      else {
        failedRows += 1;
        errors.push(...rowErrors(row, parsed.error.issues));
      }
    } else {
      const parsed = equipmentRowSchema.safeParse(row.values);
      if (parsed.success) validEquipment.push(parsed.data);
      else {
        failedRows += 1;
        errors.push(...rowErrors(row, parsed.error.issues));
      }
    }
  }

  return kind === 'products'
    ? { valid: validProducts, errors, failedRows }
    : { valid: validEquipment, errors, failedRows };
}
