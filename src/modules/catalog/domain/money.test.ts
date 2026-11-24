import { describe, expect, it } from 'vitest';

import { formatPrice, isValidPrice, normalizePrice } from './money';

describe('normalizePrice', () => {
  it.each([
    ['12.5', '12.5000'],
    ['0', '0.0000'],
    ['0.1234', '0.1234'],
    [' 7 ', '7.0000'],
    ['9999999999.9999', '9999999999.9999'],
    ['0.3', '0.3000'],
    ['1234567890.1235', '1234567890.1235'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePrice(raw)).toBe(expected);
  });

  it.each(['-1', '1.23456', '1e3', '', 'abc', '12,5', '12345678901', '.5'])('rechaza %j', (raw) => {
    expect(isValidPrice(raw)).toBe(false);
    expect(() => normalizePrice(raw)).toThrow(RangeError);
  });
});

describe('formatPrice', () => {
  it('da 4 decimales al texto de la base', () => {
    expect(formatPrice('12.5000')).toBe('12.5000');
    expect(formatPrice('3')).toBe('3.0000');
  });
});
