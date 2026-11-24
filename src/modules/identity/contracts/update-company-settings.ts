import { z } from 'zod';

import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, HEX_COLOR_PATTERN } from '../domain/company-brand';

import { CURRENCIES } from './platform-shared';

/** '' (o solo espacios) → null. */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export const inputSchema = z.object({
  /** Vacío = usar el nombre legal de la empresa. */
  displayName: z.preprocess(
    emptyToNull,
    z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX).nullable(),
  ),
  /** #RRGGBB; vacío = color por defecto. */
  primaryColor: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(HEX_COLOR_PATTERN)
      .transform((v) => v.toUpperCase())
      .nullable(),
  ),
  currency: z.enum(CURRENCIES),
});

export const outputSchema = z.object({ changed: z.boolean() });
