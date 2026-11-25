import { describe, expect, it } from 'vitest';

import {
  createDraftContract,
  listRequestsContract,
  platformUpdateDocumentSequenceContract,
  submitRequestContract,
  updateDocumentSequenceContract,
  updateDraftContract,
} from './index';

const ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

describe('createDraftContract', () => {
  const parse = (value: unknown) => createDraftContract.inputSchema.safeParse(value);

  it('acepta un borrador mínimo y normaliza cantidad, notas y vacíos', () => {
    const result = parse({
      costCenterId: '',
      reason: '  ',
      lines: [{ productId: PRODUCT, quantity: ' 2.5 ', notes: ' ' }],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      costCenterId: null,
      equipmentId: null,
      reason: null,
      lines: [{ productId: PRODUCT, quantity: '2.500', equipmentId: null, notes: null }],
    });
  });

  it('rechaza precios, subtotales o claves extra en una línea', () => {
    for (const extra of [{ unitPrice: '0.01' }, { subtotal: '0.01' }, { foo: 1 }]) {
      expect(parse({ lines: [{ productId: PRODUCT, quantity: '1', ...extra }] }).success).toBe(
        false,
      );
    }
  });

  it('descarta el total que mande el cliente en el encabezado', () => {
    const result = parse({ lines: [], totalAmount: '0.01' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ costCenterId: null, equipmentId: null, reason: null, lines: [] });
  });

  it.each(['0', '-1', '1.2345', 'abc', '', '1e3'])('rechaza la cantidad %j', (quantity) => {
    expect(parse({ lines: [{ productId: PRODUCT, quantity }] }).success).toBe(false);
  });

  it('la cantidad no puede ser number', () => {
    expect(parse({ lines: [{ productId: PRODUCT, quantity: 2 }] }).success).toBe(false);
  });

  it('rechaza más de 200 líneas y un motivo de más de 500 caracteres', () => {
    const line = { productId: PRODUCT, quantity: '1' };
    expect(parse({ lines: Array.from({ length: 200 }, () => line) }).success).toBe(true);
    expect(parse({ lines: Array.from({ length: 201 }, () => line) }).success).toBe(false);
    expect(parse({ reason: 'x'.repeat(501), lines: [] }).success).toBe(false);
  });
});

describe('updateDraftContract y submitRequestContract', () => {
  it('piden id y versión entera mayor o igual a 1', () => {
    const update = updateDraftContract.inputSchema;
    expect(update.safeParse({ id: ID, version: 1, lines: [] }).success).toBe(true);
    expect(update.safeParse({ id: ID, lines: [] }).success).toBe(false);
    const submit = submitRequestContract.inputSchema;
    expect(submit.safeParse({ id: ID, version: 0 }).success).toBe(false);
    expect(submit.safeParse({ id: ID, version: 2 }).success).toBe(true);
    expect(submit.safeParse({ id: 'x', version: 2 }).success).toBe(false);
  });
});

describe('contratos de la secuencia', () => {
  const parse = (value: unknown) => updateDocumentSequenceContract.inputSchema.safeParse(value);

  it('normaliza el prefijo a mayúsculas y convierte el número del formulario', () => {
    const result = parse({ sequencePrefix: ' gr- ', sequenceNextNumber: '500' });

    expect(result.data).toEqual({ sequencePrefix: 'GR-', sequenceNextNumber: 500 });
  });

  it.each([
    [{ sequencePrefix: '', sequenceNextNumber: 1 }],
    [{ sequencePrefix: 'A B', sequenceNextNumber: 1 }],
    [{ sequencePrefix: 'ABCDEFGHIJKLMNOPQ', sequenceNextNumber: 1 }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: 0 }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: -3 }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: 1.5 }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: '' }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: 2_000_000_000 }],
    [{ sequencePrefix: 'SOF-', sequenceNextNumber: 2_000_000_001 }],
  ])('rechaza %j', (value) => {
    expect(parse(value).success).toBe(false);
  });

  it('acepta el mayor siguiente número permitido', () => {
    expect(parse({ sequencePrefix: 'SOF-', sequenceNextNumber: 1_999_999_999 }).success).toBe(true);
  });

  it('la consola agrega el tenantId', () => {
    const schema = platformUpdateDocumentSequenceContract.inputSchema;
    const input = { tenantId: ID, sequencePrefix: 'SOF-', sequenceNextNumber: 1 };

    expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ ...input, tenantId: 'x' }).success).toBe(false);
  });
});

describe('listRequestsContract', () => {
  const parse = (value: unknown) => listRequestsContract.inputSchema.safeParse(value);

  it('sin nada: todas, sin búsqueda, página 1 de 25', () => {
    expect(parse({}).data).toEqual({ tab: 'all', q: null, page: 1, pageSize: 25 });
  });

  it('normaliza la búsqueda (recorta; vacío es null) y acepta cada pestaña', () => {
    expect(parse({ q: '  filtro  ' }).data?.q).toBe('filtro');
    expect(parse({ q: '   ' }).data?.q).toBeNull();
    for (const tab of ['all', 'awaiting_me', 'in_approval', 'approved', 'draft', 'rejected']) {
      expect(parse({ tab }).success).toBe(true);
    }
  });

  it.each([{ tab: 'otra' }, { page: 0 }, { q: 'x'.repeat(101) }])('rechaza %j', (value) => {
    expect(parse(value).success).toBe(false);
  });
});
