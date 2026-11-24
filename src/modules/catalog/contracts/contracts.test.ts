import { describe, expect, it } from 'vitest';

import { listProductsContract, searchProductsContract, upsertProductContract } from './index';

const base = { code: ' pr-001 ', name: ' Tornillo ', unit: ' und ' };

describe('upsertProductContract', () => {
  const schema = upsertProductContract.inputSchema;

  it('normaliza código, nombre, unidad y precio (siempre string)', () => {
    const parsed = schema.parse({ ...base, referencePrice: '12.5', currency: 'PEN' });

    expect(parsed).toMatchObject({
      code: 'PR-001',
      name: 'Tornillo',
      unit: 'UND',
      category: null,
      referencePrice: '12.5000',
      currency: 'PEN',
    });
  });

  it('precio y moneda opcionales, pero juntos', () => {
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, referencePrice: '1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, currency: 'USD' }).success).toBe(false);
    expect(schema.safeParse({ ...base, referencePrice: '', currency: '' }).success).toBe(true);
  });

  it.each(['-1', '1.23456', 'abc', '1e3', 5])('rechaza el precio %j', (price) => {
    expect(schema.safeParse({ ...base, referencePrice: price, currency: 'PEN' }).success).toBe(
      false,
    );
  });

  it.each([
    { code: 'con espacio' },
    { code: '' },
    { name: '   ' },
    { unit: '' },
    { currency: 'EUR', referencePrice: '1' },
  ])('rechaza %o', (override) => {
    expect(schema.safeParse({ ...base, ...override }).success).toBe(false);
  });
});

describe('listProductsContract', () => {
  it('usa página 1, 25 por página y todos los estados por defecto', () => {
    expect(listProductsContract.inputSchema.parse({})).toEqual({
      q: null,
      status: 'all',
      page: 1,
      pageSize: 25,
    });
  });
});

describe('searchProductsContract', () => {
  it('límite por defecto 20 y máximo 50', () => {
    expect(searchProductsContract.inputSchema.parse({}).limit).toBe(20);
    expect(searchProductsContract.inputSchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
