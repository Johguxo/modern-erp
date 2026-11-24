// Piezas comunes de los contratos de la consola de plataforma (E1-H4), seguras para el cliente.
import { z } from 'zod';

import { SUBSCRIPTION_STATUSES } from '../domain/subscription';
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from '../domain/tenant-slug';

export { SUBSCRIPTION_STATUSES };
export { slugFromName } from '../domain/tenant-slug';

export const CURRENCIES = ['PEN', 'USD'] as const;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN)
  .max(SLUG_MAX)
  .regex(SLUG_PATTERN);

export const planCodeSchema = z.string().trim().min(1).max(40);

/** Límite de usuarios del cliente: vacío ('' o null) = el del plan. */
export const maxUsersSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(10_000).nullable(),
);
