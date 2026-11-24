// E1-H4 · Slug del cliente: formato, reservados y propuesta desde el nombre.
import { describe, expect, it } from 'vitest';

import { isReservedSlug, SLUG_PATTERN, slugFromName } from './tenant-slug';

describe('tenant slug', () => {
  it.each(['genrent', 'empresa-prueba', 'abc123'])('acepta %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['Genrent', 'a--b', '-abc', 'abc-', 'con espacio', 'ñandú'])('rechaza %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(false);
  });

  it('reconoce los reservados', () => {
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('www')).toBe(true);
    expect(isReservedSlug('genrent')).toBe(false);
  });

  it('propone un slug válido desde el nombre', () => {
    expect(slugFromName('  Compañía Andina S.A.C. ')).toBe('compania-andina-s-a-c');
    expect(slugFromName('Genrent')).toBe('genrent');
    expect(SLUG_PATTERN.test(slugFromName('Ñuño & Hijos — Perú'))).toBe(true);
    expect(slugFromName('x'.repeat(60))).toHaveLength(40);
  });
});
