// Formato de montos en es-PE. Recibe el monto como string decimal (ADR-005: los montos viajan
// como string) y lo formatea con Intl sin pasar por `number`, así no pierde precisión.
export type CurrencyCode = 'PEN' | 'USD';

const DECIMAL = /^-?\d+(\.\d+)?$/;

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode, maxFractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${maxFractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: maxFractionDigits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

export interface FormatMoneyOptions {
  /** Decimales máximos a mostrar (mínimo siempre 2). Por defecto 2. */
  readonly maxFractionDigits?: number;
}

export function formatMoney(
  amount: string,
  currency: CurrencyCode,
  options: FormatMoneyOptions = {},
): string {
  if (!DECIMAL.test(amount)) {
    // Error de programación: el servidor siempre manda un decimal válido.
    throw new Error('formatMoney expects a decimal string');
  }
  const max = Math.max(2, options.maxFractionDigits ?? 2);
  // Intl.NumberFormat v3 (ES2023) formatea strings decimales con precisión exacta.
  return formatterFor(currency, max).format(amount as `${number}`);
}

/**
 * Normaliza un decimal para mostrarlo en un formulario: quita ceros finales pero deja al menos
 * `minFractionDigits` decimales («12.5000» da «12.50»). Solo con strings, sin pasar por number.
 */
export function trimDecimal(value: string, minFractionDigits = 2): string {
  if (!DECIMAL.test(value)) {
    throw new Error('trimDecimal expects a decimal string');
  }
  const [whole = '', fraction = ''] = value.split('.');
  let trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length < minFractionDigits) trimmed = trimmed.padEnd(minFractionDigits, '0');
  return trimmed ? `${whole}.${trimmed}` : whole;
}
