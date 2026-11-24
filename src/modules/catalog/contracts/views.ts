// Vistas (salida) de los contratos del catálogo.
import { z } from 'zod';

import { currencySchema } from './shared';

export const productViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string().nullable(),
  /** Texto con 4 decimales; nunca number. */
  referencePrice: z.string().nullable(),
  currency: currencySchema.nullable(),
  active: z.boolean(),
});

export const equipmentViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  active: z.boolean(),
});

export const costCenterViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
});
