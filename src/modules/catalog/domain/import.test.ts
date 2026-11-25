// E2-H3 · Dominio de la importación: encabezados normalizados, columnas con alias en cualquier
// orden y filas de datos con la numeración de la hoja (las vacías se saltan sin perderla).
import { describe, expect, it } from 'vitest';

import { isDomainError } from '@/shared/errors';

import {
  EQUIPMENT_COLUMNS,
  IMPORT_LIMITS,
  PRODUCT_COLUMNS,
  extractRows,
  mapColumns,
  normalizeHeader,
} from './import';

function reasonOf(fn: () => unknown): { reason: string | undefined; params: unknown } {
  try {
    fn();
  } catch (error) {
    if (isDomainError(error)) return { reason: error.reason, params: error.params };
    throw error;
  }
  throw new Error('Se esperaba un error de dominio.');
}

describe('normalizeHeader', () => {
  it.each([
    ['Código', 'codigo'],
    ['  CÓDIGO *  ', 'codigo'],
    ['Precio   referencial', 'precio referencial'],
    ['Categoría', 'categoria'],
    ['MONEDA', 'moneda'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeHeader(raw)).toBe(expected);
  });
});

describe('mapColumns', () => {
  it('reconoce los encabezados en cualquier orden, con alias y mayúsculas', () => {
    const { index, missing } = mapColumns(
      ['Unidad *', 'Precio', 'CÓDIGO', 'ignorada', 'Nombre', 'moneda'],
      PRODUCT_COLUMNS,
    );

    expect(missing).toEqual([]);
    expect(index).toEqual({ unit: 0, price: 1, code: 2, name: 4, currency: 5 });
  });

  it('con una columna repetida gana la primera', () => {
    const { index } = mapColumns(['codigo', 'nombre', 'codigo'], EQUIPMENT_COLUMNS);
    expect(index.code).toBe(0);
  });

  it('lista las obligatorias que faltan con su encabezado de la plantilla', () => {
    const { missing } = mapColumns(['Nombre', null, 'Tipo'], PRODUCT_COLUMNS);
    expect(missing).toEqual(['Código', 'Unidad']);
  });
});

describe('extractRows', () => {
  const HEADER = ['codigo', 'nombre', 'tipo'];

  it('numera como la hoja: la fila 1 es el encabezado y las vacías no cambian la cuenta', () => {
    const rows = extractRows(
      [
        HEADER,
        ['E-1', 'Grúa', null],
        [null, null, null],
        ['E-3', 'Camión', 'Pesado'],
        [],
        ['E-6', 'Auto', null],
        [null, null, null],
      ],
      'equipment',
    );

    expect(rows.map((r) => r.row)).toEqual([2, 4, 6]);
    expect(rows[1]?.values).toEqual({ code: 'E-3', name: 'Camión', type: 'Pesado' });
  });

  it('una columna opcional ausente queda en null', () => {
    const rows = extractRows(
      [
        ['codigo', 'nombre'],
        ['E-1', 'Grúa'],
      ],
      'equipment',
    );
    expect(rows[0]?.values).toEqual({ code: 'E-1', name: 'Grúa', type: null });
  });

  it('faltan columnas obligatorias → missing_columns con la lista', () => {
    expect(reasonOf(() => extractRows([['nombre'], ['x']], 'equipment'))).toEqual({
      reason: 'missing_columns',
      params: { columns: 'Código' },
    });
  });

  it('sin filas de datos → no_rows (también con solo filas vacías)', () => {
    expect(reasonOf(() => extractRows([HEADER], 'equipment')).reason).toBe('no_rows');
    expect(reasonOf(() => extractRows([HEADER, [null, null, null]], 'equipment')).reason).toBe(
      'no_rows',
    );
    expect(reasonOf(() => extractRows([], 'equipment')).reason).toBe('missing_columns');
  });

  it('acepta exactamente 5,000 filas y rechaza 5,001 → too_many_rows', () => {
    const body = (count: number) =>
      Array.from({ length: count }, (_, i): (string | null)[] => [`E-${i}`, 'x', null]);

    expect(extractRows([HEADER, ...body(IMPORT_LIMITS.maxRows)], 'equipment')).toHaveLength(
      IMPORT_LIMITS.maxRows,
    );
    expect(
      reasonOf(() => extractRows([HEADER, ...body(IMPORT_LIMITS.maxRows + 1)], 'equipment')),
    ).toEqual({ reason: 'too_many_rows', params: { max: IMPORT_LIMITS.maxRows } });
  });
});
