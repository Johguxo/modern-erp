// Precio de referencia (CLAUDE.md regla 5): decimal.js en el dominio, numeric(14,4) en la base y
// string en los contratos. Nunca number.
import Decimal from 'decimal.js';

export const CURRENCIES = ['PEN', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PRICE_SCALE = 4;
/** Hasta 10 enteros y 4 decimales (numeric(14,4)), sin signo ni notación científica. */
export const PRICE_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

export function isValidPrice(raw: string): boolean {
  return PRICE_PATTERN.test(raw);
}

/** Texto canónico con 4 decimales ("12.5" → "12.5000"). Lanza si el texto no es un precio válido. */
export function normalizePrice(raw: string): string {
  const text = raw.trim();
  if (!isValidPrice(text)) throw new RangeError('Invalid price');
  return new Decimal(text).toFixed(PRICE_SCALE);
}

/** Texto de numeric(14,4) de la base → texto canónico (los casos de uso nunca ven un number). */
export function formatPrice(value: string): string {
  return new Decimal(value).toFixed(PRICE_SCALE);
}
