import { describe, expect, it } from 'vitest';

import { CODE_MAX, isValidCode, normalizeCode } from './codes';

describe('normalizeCode', () => {
  it('recorta y pasa a mayúsculas', () => {
    expect(normalizeCode('  pr-001 ')).toBe('PR-001');
  });
});

describe('isValidCode', () => {
  it.each(['A', 'PR-001', 'A1.2/3-X', '7'])('acepta %s', (code) => {
    expect(isValidCode(code)).toBe(true);
  });

  it.each(['', 'pr-001', 'PR 001', '-A', '.A', 'Ñ1', 'A'.repeat(CODE_MAX + 1)])(
    'rechaza %j',
    (code) => {
      expect(isValidCode(code)).toBe(false);
    },
  );

  it('acepta exactamente el máximo', () => {
    expect(isValidCode('A'.repeat(CODE_MAX))).toBe(true);
  });
});
