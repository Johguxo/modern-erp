// Formato de montos en es-PE. Recibe el monto como string decimal (ADR-005: los montos viajan
// como string) y lo formatea con Intl sin pasar por `number`, así no pierde precisión.
export type CurrencyCode = 'PEN' | 'USD';

const DECIMAL = /^-?\d+(\.\d+)?$/;

const formatters = new Map<CurrencyCode, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(amount: string, currency: CurrencyCode): string {
  if (!DECIMAL.test(amount)) {
    // Error de programación: el servidor siempre manda un decimal válido.
    throw new Error('formatMoney expects a decimal string');
  }
  // Intl.NumberFormat v3 (ES2023) formatea strings decimales con precisión exacta.
  return formatterFor(currency).format(amount as `${number}`);
}
