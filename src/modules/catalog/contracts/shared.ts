// Esquemas comunes de los contratos del catálogo (solo Zod, aptos para el cliente).
import { z } from 'zod';

import { paginationSchema } from '@/shared/pagination';

import { CODE_MAX, CODE_PATTERN } from '../domain/codes';
import { CURRENCIES, PRICE_PATTERN, normalizePrice } from '../domain/money';

export const NAME_MAX = 200;
export const UNIT_MAX = 20;
export const CATEGORY_MAX = 80;
export const TYPE_MAX = 80;
export const SEARCH_MAX = 100;

/** Ausente, '' o solo espacios → null. */
export const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

export const codeSchema = z.string().trim().toUpperCase().min(1).max(CODE_MAX).regex(CODE_PATTERN);
export const nameSchema = z.string().trim().min(1).max(NAME_MAX);
export const unitSchema = z.string().trim().toUpperCase().min(1).max(UNIT_MAX);
export const optionalTextSchema = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());

export const currencySchema = z.enum(CURRENCIES);
/** Precio como texto ("12.5"); sale canónico con 4 decimales. Nunca number. */
export const priceSchema = z.string().trim().regex(PRICE_PATTERN).transform(normalizePrice);

export const STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export const statusFilterSchema = z.enum(STATUS_FILTERS);

/** Filtros de listado: texto en código o nombre, estado y página. */
export const listInputSchema = paginationSchema.extend({
  q: z.preprocess(blankToNull, z.string().trim().max(SEARCH_MAX).nullable()),
  status: statusFilterSchema.default('all'),
});

export const setActiveInputSchema = z.object({ id: z.uuid(), active: z.boolean() });
export const setActiveOutputSchema = z.object({ changed: z.boolean() });

export function pageOutputSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

export function upsertOutputSchema<T extends z.ZodType>(item: T) {
  return z.object({ item, created: z.boolean(), changed: z.boolean() });
}
