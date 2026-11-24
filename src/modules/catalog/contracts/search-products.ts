// Búsqueda de productos para el selector del SOF: solo activos, máximo 50.
import { z } from 'zod';

import { SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT } from '../domain/search';

import { currencySchema, SEARCH_MAX } from './shared';

export const inputSchema = z.object({
  q: z.string().trim().max(SEARCH_MAX).default(''),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
});

export const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      unit: z.string(),
      category: z.string().nullable(),
      /** Texto con 4 decimales; nunca number. */
      referencePrice: z.string().nullable(),
      currency: currencySchema.nullable(),
    }),
  ),
});
