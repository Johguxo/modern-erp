import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INBOX_PARAMS,
  inboxHref,
  isPristine,
  pageCountOf,
  parseInboxParams,
} from './inbox-params';

describe('parseInboxParams', () => {
  it('sin params usa los valores por defecto', () => {
    expect(parseInboxParams({})).toEqual(DEFAULT_INBOX_PARAMS);
  });

  it('lee tab, q y page', () => {
    expect(parseInboxParams({ tab: 'draft', q: ' filtro ', page: '3' })).toEqual({
      tab: 'draft',
      q: 'filtro',
      page: 3,
      pageSize: 25,
    });
  });

  it('un q vacío es null; un array toma el primer valor', () => {
    expect(parseInboxParams({ q: '  ' }).q).toBeNull();
    expect(parseInboxParams({ tab: ['rejected', 'all'] }).tab).toBe('rejected');
  });

  it.each([
    { tab: 'otra' },
    { page: '0' },
    { page: 'abc' },
    { page: '-2' },
    { page: '1.5' },
    { q: 'x'.repeat(101) },
  ])('params inválidos %j dan los valores por defecto', (raw) => {
    expect(parseInboxParams(raw)).toEqual(DEFAULT_INBOX_PARAMS);
  });

  it('ignora un pageSize en la URL: siempre 25', () => {
    expect(parseInboxParams({ pageSize: '100' }).pageSize).toBe(25);
  });
});

describe('pageCountOf', () => {
  it.each([
    [0, 1],
    [1, 1],
    [25, 1],
    [26, 2],
    [30, 2],
  ])('%i solicitudes dan %i páginas', (total, pages) => {
    expect(pageCountOf(total, 25)).toBe(pages);
  });
});

describe('isPristine', () => {
  it('solo «Todas» y sin búsqueda', () => {
    expect(isPristine({ tab: 'all', q: null })).toBe(true);
    expect(isPristine({ tab: 'draft', q: null })).toBe(false);
    expect(isPristine({ tab: 'all', q: 'a' })).toBe(false);
  });
});

describe('inboxHref', () => {
  it('omite los valores por defecto', () => {
    expect(inboxHref({})).toBe('/bandeja');
    expect(inboxHref({ tab: 'all', q: null, page: 1 })).toBe('/bandeja');
  });

  it('arma tab, q y page', () => {
    expect(inboxHref({ tab: 'approved', q: 'a b', page: 2 })).toBe(
      '/bandeja?tab=approved&q=a+b&page=2',
    );
    expect(inboxHref({ tab: 'draft' })).toBe('/bandeja?tab=draft');
  });
});
