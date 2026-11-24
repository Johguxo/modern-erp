import { describe, expect, it } from 'vitest';

import { offsetOf, paginationSchema } from './pagination';

describe('paginationSchema', () => {
  it('usa página 1 y 25 por página por defecto', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('convierte textos numéricos (parámetros de URL)', () => {
    expect(paginationSchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([{ page: 0 }, { page: -1 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }])(
    'rechaza %o',
    (input) => {
      expect(paginationSchema.safeParse(input).success).toBe(false);
    },
  );

  it('acepta pageSize 1 y 100', () => {
    expect(paginationSchema.parse({ pageSize: 1 }).pageSize).toBe(1);
    expect(paginationSchema.parse({ pageSize: 100 }).pageSize).toBe(100);
  });
});

describe('offsetOf', () => {
  it('la página 1 no salta filas', () => {
    expect(offsetOf({ page: 1, pageSize: 25 })).toBe(0);
  });

  it('salta las páginas anteriores', () => {
    expect(offsetOf({ page: 3, pageSize: 20 })).toBe(40);
  });
});
