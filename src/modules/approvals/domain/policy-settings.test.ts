import { describe, expect, it } from 'vitest';

import { reapprovalToleranceOf } from './policy-settings';

describe('reapprovalToleranceOf', () => {
  it.each([
    ['0', '0'],
    ['5', '5'],
    [' 2.5 ', '2.5'],
    ['100', '100'],
    ['100.0000', '100.0000'],
  ])('%j es válida', (raw, expected) => {
    expect(reapprovalToleranceOf({ reapproval_tolerance_pct: raw })).toEqual({
      tolerancePct: expected,
      fallback: null,
    });
  });

  it.each([{}, null, undefined, [], 'texto', { otra: '5' }])(
    'sin el ajuste (%j) vale 0 y queda como missing',
    (settings) => {
      expect(reapprovalToleranceOf(settings)).toEqual({ tolerancePct: '0', fallback: 'missing' });
    },
  );

  it.each(['-1', '100.01', '101', '1e2', '', 'abc', '5%', '1,5', 5, true, {}])(
    'el valor %j no es válido: vale 0 y queda como invalid',
    (raw) => {
      expect(reapprovalToleranceOf({ reapproval_tolerance_pct: raw })).toEqual({
        tolerancePct: '0',
        fallback: 'invalid',
      });
    },
  );
});
