// Dinero y cantidades del SOF (CLAUDE.md regla 5): decimal.js en el dominio, numeric en la base y
// string en los contratos. Nunca number. El redondeo es HALF_UP y se hace aquí, en el servidor.
import Decimal from 'decimal.js';

import { ValidationError } from '@/shared/errors';

/** Constructor propio: no cambia la configuración global de decimal.js. */
const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const CURRENCIES = ['PEN', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const QUANTITY_SCALE = 3;
export const PRICE_SCALE = 4;
export const AMOUNT_SCALE = 2;

/** numeric(14,3): hasta 11 enteros y 3 decimales (G7), sin signo ni notación científica. */
export const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;
/** numeric(14,2): el mayor monto que guarda la base. */
export const MAX_AMOUNT = new Dec('999999999999.99');

/** Cantidad válida y mayor que cero, o null. */
export function parseQuantity(raw: string): Decimal | null {
  const text = raw.trim();
  if (!QUANTITY_PATTERN.test(text)) return null;
  const value = new Dec(text);
  return value.gt(0) ? value : null;
}

/**
 * Suma 1 a una cantidad escrita por el usuario y devuelve el texto sin ceros finales ("2.5" → "3.5").
 * Una cantidad no válida cuenta como 0 ("" → "1"). Si el resultado ya no cabe en numeric(14,3)
 * devuelve la cantidad original sin cambios.
 */
export function incrementQuantity(raw: string): string {
  const next = (parseQuantity(raw) ?? new Dec(0)).plus(1).toFixed();
  return QUANTITY_PATTERN.test(next) ? next : raw;
}

/** Texto canónico con 3 decimales ("2" → "2.000"). Lanza si la cantidad no es válida. */
export function normalizeQuantity(raw: string): string {
  const value = parseQuantity(raw);
  if (!value) throw new RangeError('Invalid quantity');
  return value.toFixed(QUANTITY_SCALE);
}

function assertWithinMax(value: Decimal): void {
  if (value.gt(MAX_AMOUNT)) {
    throw new ValidationError({
      reason: 'amount_too_large',
      fieldErrors: { root: ['amount_too_large'] },
      message: 'Amount exceeds numeric(14,2)',
    });
  }
}

/** subtotal = round(cantidad × precio, 2, HALF_UP). `amount_too_large` si no cabe en la base. */
export function lineSubtotal(quantity: string, unitPrice: string): string {
  const subtotal = new Dec(quantity).mul(new Dec(unitPrice)).toDecimalPlaces(AMOUNT_SCALE);
  assertWithinMax(subtotal);
  return subtotal.toFixed(AMOUNT_SCALE);
}

/** Suma de subtotales con 2 decimales. `amount_too_large` si no cabe en la base. */
export function sumTotal(subtotals: readonly string[]): string {
  const total = subtotals.reduce((sum, value) => sum.plus(new Dec(value)), new Dec(0));
  assertWithinMax(total);
  return total.toFixed(AMOUNT_SCALE);
}

export const formatQuantity = (value: string): string => new Dec(value).toFixed(QUANTITY_SCALE);
export const formatUnitPrice = (value: string): string => new Dec(value).toFixed(PRICE_SCALE);
export const formatAmount = (value: string): string => new Dec(value).toFixed(AMOUNT_SCALE);
