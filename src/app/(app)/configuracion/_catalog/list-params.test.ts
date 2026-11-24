import { describe, expect, it } from 'vitest';

import { DEFAULT_LIST_PARAMS, isPristine, pageCountOf, parseListParams } from './list-params';

describe('parseListParams', () => {
  it('sin params usa los valores por defecto', () => {
    expect(parseListParams({})).toEqual(DEFAULT_LIST_PARAMS);
  });

  it('lee q, status y page', () => {
    expect(parseListParams({ q: ' tubo ', status: 'active', page: '3' })).toEqual({
      q: 'tubo',
      status: 'active',
      page: 3,
      pageSize: 25,
    });
  });

  it('un q vacío es null; un array toma el primer valor', () => {
    expect(parseListParams({ q: '  ' }).q).toBeNull();
    expect(parseListParams({ status: ['inactive', 'all'] }).status).toBe('inactive');
  });

  it.each([
    { status: 'otro' },
    { page: '0' },
    { page: 'abc' },
    { page: '-2' },
    { page: '1.5' },
    { q: 'x'.repeat(101) },
  ])('params inválidos %j dan los valores por defecto', (raw) => {
    expect(parseListParams(raw)).toEqual(DEFAULT_LIST_PARAMS);
  });

  it('ignora un pageSize en la URL: siempre 25', () => {
    expect(parseListParams({ pageSize: '100' }).pageSize).toBe(25);
  });
});

describe('pageCountOf', () => {
  it.each([
    [0, 1],
    [1, 1],
    [25, 1],
    [26, 2],
    [100, 4],
  ])('%i registros dan %i páginas', (total, pages) => {
    expect(pageCountOf(total, 25)).toBe(pages);
  });
});

describe('isPristine', () => {
  it('sin búsqueda y con estado "todos"', () => {
    expect(isPristine({ q: null, status: 'all' })).toBe(true);
    expect(isPristine({ q: 'a', status: 'all' })).toBe(false);
    expect(isPristine({ q: null, status: 'active' })).toBe(false);
  });
});
