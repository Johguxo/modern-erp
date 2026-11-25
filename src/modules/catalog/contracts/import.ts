// Esquemas comunes de la importación del catálogo (E2-H3): tipo, fila validada, error por fila y
// resumen. Solo Zod: aptos para el cliente.
import { z } from 'zod';

import { IMPORT_KINDS, IMPORT_LIMITS } from '../domain/import';
import { PRICE_PATTERN, normalizePrice } from '../domain/money';

import {
  CATEGORY_MAX,
  TYPE_MAX,
  blankToNull,
  codeSchema,
  currencySchema,
  nameSchema,
  optionalTextSchema,
  unitSchema,
} from './shared';

export const importKindSchema = z.enum(IMPORT_KINDS);
export const IMPORT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export const importStatusSchema = z.enum(IMPORT_STATUSES);

/** Solo punto decimal, hasta 10 enteros y 4 decimales; sin comas, separadores de miles ni redondeo. */
const importPriceSchema = z.string().trim().regex(PRICE_PATTERN).transform(normalizePrice);

/** "pen" y " USD " valen; cualquier otra cosa falla como moneda inválida. */
const importCurrencySchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  currencySchema,
);

/**
 * Fila de producto del archivo. Precio sin moneda: se usa la de la empresa; moneda sin precio:
 * `price_required`. La salida usa los nombres del dominio (`referencePrice`).
 */
export function productRowSchema(defaultCurrency: z.infer<typeof currencySchema>) {
  return z
    .object({
      code: codeSchema,
      name: nameSchema,
      unit: unitSchema,
      category: optionalTextSchema(CATEGORY_MAX),
      price: z.preprocess(blankToNull, importPriceSchema.nullable()),
      currency: z.preprocess(blankToNull, importCurrencySchema.nullable()),
    })
    .superRefine((value, ctx) => {
      if (value.price === null && value.currency !== null) {
        ctx.addIssue({ code: 'custom', path: ['price'], message: 'price_required' });
      }
    })
    .transform((value) => ({
      code: value.code,
      name: value.name,
      unit: value.unit,
      category: value.category,
      referencePrice: value.price,
      currency: value.price === null ? null : (value.currency ?? defaultCurrency),
    }));
}

export const equipmentRowSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  type: optionalTextSchema(TYPE_MAX),
});

/** Fila sin validar tal como llega del archivo (y como se guarda en import_jobs.payload). */
export const importRowSchema = z.object({
  row: z.number().int().min(2),
  values: z.record(z.string(), z.string().nullable()),
});

/**
 * Filas que entran a la vista previa y a la creación del job: las acota por si algo las arma mal
 * (máximo de filas, columnas conocidas y largo de celda del adaptador).
 */
export const importRowsInputSchema = z
  .array(
    z.object({
      row: z.number().int().min(2).max(1_048_576),
      values: z
        .record(z.string().max(30), z.string().max(1001).nullable())
        .refine((values) => Object.keys(values).length <= 10),
    }),
  )
  .max(IMPORT_LIMITS.maxRows);

/** Lo que se guarda en import_jobs.payload hasta que el worker lo procesa. */
export const importPayloadSchema = z.object({
  kind: importKindSchema,
  /** Moneda de la empresa al confirmar: la de los precios sin moneda. */
  defaultCurrency: currencySchema,
  rows: z.array(importRowSchema),
});

export const rowErrorSchema = z.object({
  /** Número de fila de la hoja (el encabezado es la 1). */
  row: z.number().int().min(1),
  /** Código del producto o equipo de esa fila, si se pudo leer. */
  code: z.string().nullable(),
  /** Columna con el problema (clave del campo), o null si es de toda la fila. */
  field: z.string().nullable(),
  /** Clave del mensaje (messages.catalog.importer.rowReasons). */
  reason: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const importSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type ImportKindValue = z.infer<typeof importKindSchema>;
export type RowError = z.infer<typeof rowErrorSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
