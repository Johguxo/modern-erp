// Crear o actualizar un producto. Precio y moneda van juntos o ninguno.
import { z } from 'zod';

import {
  CATEGORY_MAX,
  blankToNull,
  codeSchema,
  currencySchema,
  nameSchema,
  optionalTextSchema,
  priceSchema,
  unitSchema,
  upsertOutputSchema,
} from './shared';
import { productViewSchema } from './views';

export const inputSchema = z
  .object({
    /** Con id se actualiza; el código no cambia (se ignora el que venga). */
    id: z.uuid().optional(),
    code: codeSchema,
    name: nameSchema,
    unit: unitSchema,
    category: optionalTextSchema(CATEGORY_MAX),
    referencePrice: z.preprocess(blankToNull, priceSchema.nullable()),
    currency: z.preprocess(blankToNull, currencySchema.nullable()),
  })
  .superRefine((value, ctx) => {
    if (value.referencePrice === null && value.currency !== null) {
      ctx.addIssue({ code: 'custom', path: ['referencePrice'], message: 'price_required' });
    }
    if (value.referencePrice !== null && value.currency === null) {
      ctx.addIssue({ code: 'custom', path: ['currency'], message: 'currency_required' });
    }
  });

export const outputSchema = upsertOutputSchema(productViewSchema);
