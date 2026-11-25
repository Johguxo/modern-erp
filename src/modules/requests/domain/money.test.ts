import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors';

import {
  MAX_AMOUNT,
  formatAmount,
  formatQuantity,
  formatUnitPrice,
  incrementQuantity,
  lineSubtotal,
  normalizeQuantity,
  parseQuantity,
  sumTotal,
} from './money';

describe('parseQuantity', () => {
  it.each([
    ['1', '1'],
    ['2.5', '2.5'],
    ['0.001', '0.001'],
    [' 3.250 ', '3.25'],
    ['99999999999.999', '99999999999.999'],
  ])('%j es válida', (raw, expected) => {
    expect(parseQuantity(raw)?.toString()).toBe(expected);
  });

  it.each(['0', '0.000', '-1', '1.2345', '1e3', '', 'abc', '1,5', '.5', '123456789012'])(
    'rechaza %j',
    (raw) => {
      expect(parseQuantity(raw)).toBeNull();
    },
  );
});

describe('normalizeQuantity', () => {
  it('da 3 decimales', () => {
    expect(normalizeQuantity('2')).toBe('2.000');
    expect(normalizeQuantity('0.5')).toBe('0.500');
  });

  it('lanza si no es válida', () => {
    expect(() => normalizeQuantity('0')).toThrow(RangeError);
  });
});

describe('lineSubtotal (HALF_UP a 2 decimales)', () => {
  it.each([
    ['1.000', '10.0000', '10.00'],
    ['2.500', '3.3333', '8.33'], // 8.33325
    ['0.001', '0.5000', '0.00'], // 0.0005 → 0.00
    ['1.000', '0.0050', '0.01'], // 0.005 → 0.01
    ['3.000', '0.1250', '0.38'], // 0.375 → 0.38
    ['1.000', '0.0049', '0.00'],
    ['0.100', '0.2000', '0.02'],
    ['7.000', '0.0000', '0.00'],
  ])('%s × %s = %s', (quantity, price, expected) => {
    expect(lineSubtotal(quantity, price)).toBe(expected);
  });

  it('no sufre errores de coma flotante', () => {
    // 0.1 + 0.2 con number da 0.30000000000000004; aquí 3 × 0.1 exacto.
    expect(lineSubtotal('3.000', '0.1000')).toBe('0.30');
    expect(lineSubtotal('1.005', '1.0000')).toBe('1.01'); // 1.005 exacto, HALF_UP
  });

  it('lanza amount_too_large si no cabe en numeric(14,2)', () => {
    let error: unknown;
    try {
      lineSubtotal('99999999999.999', '9999999999.9999');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ reason: 'amount_too_large' });
  });
});

describe('sumTotal', () => {
  it('suma con 2 decimales', () => {
    expect(sumTotal([])).toBe('0.00');
    expect(sumTotal(['0.10', '0.20'])).toBe('0.30');
    expect(sumTotal(['8.33', '8.33', '8.34'])).toBe('25.00');
  });

  it('acepta el máximo exacto', () => {
    expect(sumTotal([MAX_AMOUNT.toFixed(2)])).toBe('999999999999.99');
  });

  it('lanza amount_too_large pasado el máximo', () => {
    expect(() => sumTotal(['999999999999.99', '0.01'])).toThrow(ValidationError);
  });
});

describe('formatos', () => {
  it('cantidad 3, precio 4 y monto 2 decimales', () => {
    expect(formatQuantity('2')).toBe('2.000');
    expect(formatUnitPrice('3.5')).toBe('3.5000');
    expect(formatAmount('10')).toBe('10.00');
    expect(formatAmount('10.1')).toBe('10.10');
  });
});

describe('incrementQuantity', () => {
  it.each([
    ['1', '2'],
    ['2.5', '3.5'],
    ['0.001', '1.001'],
    [' 3.250 ', '4.25'],
    ['', '1'],
    ['abc', '1'],
    ['0', '1'],
    ['-4', '1'],
  ])('%j + 1 = %j', (raw, expected) => {
    expect(incrementQuantity(raw)).toBe(expected);
  });

  it('no desborda numeric(14,3): deja la cantidad como estaba', () => {
    expect(incrementQuantity('99999999999.999')).toBe('99999999999.999');
  });

  it('el resultado siempre es una cantidad válida', () => {
    expect(parseQuantity(incrementQuantity('7.125'))?.toString()).toBe('8.125');
  });
});
