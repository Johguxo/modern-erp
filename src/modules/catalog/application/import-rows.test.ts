// E2-H3 · Validación fila por fila: reglas del catálogo, claves `reason` para la UI, precios solo
// con punto decimal, moneda por defecto y códigos repetidos en el archivo.
import { describe, expect, it } from 'vitest';

import type { ImportRow } from '../domain/import';

import { validateImportRows } from './import-rows';

const row = (n: number, values: Record<string, string | null>): ImportRow => ({
  row: n,
  values: {
    code: null,
    name: null,
    unit: null,
    category: null,
    price: null,
    currency: null,
    type: null,
    ...values,
  },
});

const product = (n: number, over: Record<string, string | null> = {}) =>
  row(n, { code: `P-${n}`, name: 'Tubo', unit: 'und', ...over });

const options = { defaultCurrency: 'PEN' } as const;

describe('validateImportRows · productos', () => {
  it('normaliza código y unidad, deja el precio con 4 decimales y usa la moneda de la empresa', () => {
    const { valid, errors, failedRows } = validateImportRows(
      'products',
      [product(2, { code: ' p-1 ', price: '12.5', category: ' Tubería ' })],
      options,
    );

    expect(errors).toEqual([]);
    expect(failedRows).toBe(0);
    expect(valid).toEqual([
      {
        code: 'P-1',
        name: 'Tubo',
        unit: 'UND',
        category: 'Tubería',
        referencePrice: '12.5000',
        currency: 'PEN',
      },
    ]);
  });

  it('respeta la moneda del archivo (sin importar mayúsculas) y sin precio ni moneda deja ambos en null', () => {
    const { valid } = validateImportRows(
      'products',
      [product(2, { price: '3', currency: 'usd' }), product(3)],
      options,
    );

    expect(valid[0]).toMatchObject({ referencePrice: '3.0000', currency: 'USD' });
    expect(valid[1]).toMatchObject({ referencePrice: null, currency: null, category: null });
  });

  it('moneda sin precio → price_required en el campo precio', () => {
    const { errors, valid } = validateImportRows(
      'products',
      [product(2, { currency: 'PEN' })],
      options,
    );

    expect(valid).toEqual([]);
    expect(errors).toEqual([
      { row: 2, code: 'P-2', field: 'price', reason: 'price_required', params: {} },
    ]);
  });

  it.each([
    ['coma decimal', '12,5'],
    ['separador de miles', '1,250.50'],
    ['más de 4 decimales', '1.23456'],
    ['negativo', '-1'],
    ['notación científica', '1e3'],
    ['texto', 'doce'],
  ])('precio con %s → invalid_price (sin redondear en silencio)', (_name, price) => {
    const { errors } = validateImportRows('products', [product(2, { price })], options);
    expect(errors).toEqual([
      { row: 2, code: 'P-2', field: 'price', reason: 'invalid_price', params: {} },
    ]);
  });

  it('moneda desconocida → invalid_currency', () => {
    const { errors } = validateImportRows(
      'products',
      [product(2, { price: '1', currency: 'EUR' })],
      options,
    );
    expect(errors).toEqual([
      { row: 2, code: 'P-2', field: 'currency', reason: 'invalid_currency', params: {} },
    ]);
  });

  it('un error por campo, con la razón de cada uno', () => {
    const { errors, failedRows } = validateImportRows(
      'products',
      [row(5, { code: 'con espacio', name: 'x'.repeat(201), unit: null })],
      options,
    );

    expect(failedRows).toBe(1);
    expect(errors).toEqual([
      { row: 5, code: 'con espacio', field: 'code', reason: 'invalid_code', params: {} },
      { row: 5, code: 'con espacio', field: 'name', reason: 'too_long', params: { max: 200 } },
      { row: 5, code: 'con espacio', field: 'unit', reason: 'required', params: {} },
    ]);
  });

  it('código vacío → required, y el error no trae código', () => {
    const { errors } = validateImportRows(
      'products',
      [row(2, { name: 'Tubo', unit: 'UND' })],
      options,
    );
    expect(errors).toEqual([{ row: 2, code: null, field: 'code', reason: 'required', params: {} }]);
  });

  it('un código repetido (sin importar mayúsculas) → duplicate_in_file con la primera fila; gana la primera', () => {
    const { valid, errors, failedRows } = validateImportRows(
      'products',
      [product(2, { code: 'a-1' }), product(3, { code: 'B-1' }), product(7, { code: 'A-1' })],
      options,
    );

    expect(valid.map((r) => r.code)).toEqual(['A-1', 'B-1']);
    expect(failedRows).toBe(1);
    expect(errors).toEqual([
      { row: 7, code: 'A-1', field: 'code', reason: 'duplicate_in_file', params: { firstRow: 2 } },
    ]);
  });

  it('la primera aparición reclama el código aunque tenga errores en otros campos', () => {
    const { valid, errors } = validateImportRows(
      'products',
      [row(2, { code: 'X-1', name: 'Tubo', unit: null }), product(3, { code: 'X-1' })],
      options,
    );

    expect(valid).toEqual([]);
    expect(errors.map((e) => [e.row, e.reason])).toEqual([
      [2, 'required'],
      [3, 'duplicate_in_file'],
    ]);
  });
});

describe('validateImportRows · equipos', () => {
  it('valida código, nombre y tipo opcional', () => {
    const { valid, errors } = validateImportRows(
      'equipment',
      [
        row(2, { code: 'eq-1', name: 'Grúa', type: ' Pesado ' }),
        row(3, { code: 'EQ-2', name: 'Camión' }),
        row(4, { code: 'EQ-3', name: null }),
      ],
      options,
    );

    expect(valid).toEqual([
      { code: 'EQ-1', name: 'Grúa', type: 'Pesado' },
      { code: 'EQ-2', name: 'Camión', type: null },
    ]);
    expect(errors).toEqual([
      { row: 4, code: 'EQ-3', field: 'name', reason: 'required', params: {} },
    ]);
  });
});
