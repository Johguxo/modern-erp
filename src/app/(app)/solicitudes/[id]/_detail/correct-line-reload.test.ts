import { describe, expect, it } from 'vitest';

import { offersReload } from './correct-line-reload';

describe('offersReload', () => {
  it.each([
    [{ code: 'CONFLICT' }, true],
    [{ code: 'INVALID_TRANSITION' }, true],
    [{ code: 'VALIDATION', reason: 'stale_version' }, true],
    [{ code: 'VALIDATION', reason: 'quantity_invalid' }, false],
    [{ code: 'FORBIDDEN' }, false],
    [{ code: 'INTERNAL' }, false],
  ])('%j -> %s', (error, expected) => {
    expect(offersReload(error)).toBe(expected);
  });
});
