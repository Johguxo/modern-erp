// E0-H4 · MoneyText (formato es-PE): montos como string decimal, sin perder precisión.
import { describe, expect, it } from 'vitest';

import { formatMoney } from './money';

const NBSP = ' ';

describe('formatMoney (formato es-PE)', () => {
  it('formatea soles con S/, espacio no separable, coma de miles y punto decimal', () => {
    expect(formatMoney('1860', 'PEN')).toBe(`S/${NBSP}1,860.00`);
  });

  it('formatea dólares con el código USD', () => {
    expect(formatMoney('1860', 'USD')).toBe(`USD${NBSP}1,860.00`);
  });

  it('muestra montos negativos con el signo delante', () => {
    expect(formatMoney('-1860.5', 'PEN')).toBe(`-S/${NBSP}1,860.50`);
  });

  it('muestra siempre dos decimales y redondea al tercero', () => {
    expect(formatMoney('0', 'PEN')).toBe(`S/${NBSP}0.00`);
    expect(formatMoney('10.005', 'PEN')).toBe(`S/${NBSP}10.01`);
    expect(formatMoney('10.004', 'PEN')).toBe(`S/${NBSP}10.00`);
  });

  it('no pierde precisión con montos que exceden la precisión de number', () => {
    expect(formatMoney('12345678901234.56', 'PEN')).toBe(`S/${NBSP}12,345,678,901,234.56`);
    // Con number, este monto se redondearía a ...234.57 o perdería el último dígito.
    expect(formatMoney('99999999999999.99', 'PEN')).toBe(`S/${NBSP}99,999,999,999,999.99`);
  });

  it.each(['abc', '1,000', '', '1e3', ' 1', '1.', '.5', 'NaN', 'Infinity'])(
    'rechaza el monto inválido %j',
    (amount) => {
      expect(() => formatMoney(amount, 'PEN')).toThrow();
    },
  );
});
