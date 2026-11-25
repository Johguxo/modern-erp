import { describe, expect, it } from 'vitest';

import type { RequestView } from '@/modules/requests';
import type { ActionError } from '@/shared/result';

import {
  computeTotals,
  emptyState,
  errorsFromAction,
  fromRequestView,
  hasErrors,
  lineError,
  reducer,
  toDraftInput,
  validateForSave,
  validateForSubmit,
  type CatalogItem,
  type EditorAction,
  type EditorState,
} from './editor-state';

const ID = '11111111-1111-4111-8111-111111111111';
const CC = '66666666-6666-4666-8666-666666666661';
const EQ1 = '77777777-7777-4777-8777-777777777771';
const EQ2 = '77777777-7777-4777-8777-777777777772';

const FIL: CatalogItem = {
  id: '55555555-5555-4555-8555-555555555551',
  code: 'FIL-1',
  name: 'Filtro',
  unit: 'UND',
  category: null,
  referencePrice: '12.5000',
  currency: 'PEN',
};
const PER: CatalogItem = {
  id: '55555555-5555-4555-8555-555555555552',
  code: 'PER-2',
  name: 'Perno',
  unit: 'UND',
  category: null,
  referencePrice: '3.3333',
  currency: 'PEN',
};
const SIN: CatalogItem = {
  id: '55555555-5555-4555-8555-555555555553',
  code: 'SIN-3',
  name: 'Sin precio',
  unit: 'UND',
  category: null,
  referencePrice: null,
  currency: null,
};

const run = (actions: readonly EditorAction[], from: EditorState = emptyState()): EditorState =>
  actions.reduce(reducer, from);

const add = (product: CatalogItem): EditorAction => ({ type: 'addProduct', product });

describe('reducer · líneas', () => {
  it('agregar un producto nuevo crea la línea con cantidad 1 y el equipo de la cabecera', () => {
    const state = run([{ type: 'setHeader', field: 'equipmentId', value: EQ1 }, add(FIL)]);

    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({
      productId: FIL.id,
      code: 'FIL-1',
      quantity: '1',
      unitPrice: '12.5000',
      equipmentId: EQ1,
    });
  });

  it('agregar un producto que ya está suma 1 a su cantidad, sin duplicar la línea', () => {
    const state = run([add(FIL), add(FIL), add(FIL)]);

    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.quantity).toBe('3');
  });

  it('un producto sin precio entra con precio 0', () => {
    expect(run([add(SIN)]).lines[0]?.unitPrice).toBe('0.0000');
  });

  it('las claves de las líneas no se repiten aunque se quiten y agreguen líneas', () => {
    const state = run([add(FIL), add(PER)]);
    const [first] = state.lines;
    const after = run([{ type: 'removeLine', key: first?.key ?? '' }, add(FIL)], state);

    const keys = after.lines.map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(after.lines.map((l) => l.code)).toEqual(['PER-2', 'FIL-1']);
  });

  it('cambiar cantidad y equipo de una línea no toca las demás', () => {
    const base = run([add(FIL), add(PER)]);
    const [a, b] = base.lines;
    const state = run(
      [
        { type: 'setQuantity', key: a?.key ?? '', value: '4.5' },
        { type: 'setLineEquipment', key: a?.key ?? '', value: EQ2 },
      ],
      base,
    );

    expect(state.lines[0]).toMatchObject({ quantity: '4.5', equipmentId: EQ2 });
    expect(state.lines[1]).toEqual(b);
  });

  it('quitar una línea la saca de la lista', () => {
    const base = run([add(FIL), add(PER)]);
    const state = run([{ type: 'removeLine', key: base.lines[0]?.key ?? '' }], base);

    expect(state.lines.map((l) => l.code)).toEqual(['PER-2']);
  });

  it('cualquier cambio de líneas limpia los errores y el aviso', () => {
    const base: EditorState = {
      ...run([add(FIL)]),
      notice: 'Borrador guardado.',
      errors: { reload: false, general: 'Revisa', fields: { 'lines.0.quantity': 'mal' } },
    };
    const key = base.lines[0]?.key ?? '';

    for (const action of [
      add(PER),
      add(FIL),
      { type: 'setQuantity', key, value: '2' } as const,
      { type: 'setLineEquipment', key, value: EQ1 } as const,
      { type: 'removeLine', key } as const,
    ]) {
      const next = reducer(base, action);
      expect(next.errors).toEqual({ reload: false, fields: {} });
      expect(next.notice).toBeNull();
    }
  });
});

describe('reducer · cabecera, errores y carga', () => {
  it('setHeader cambia el campo y limpia solo el error de ese campo', () => {
    const base: EditorState = {
      ...emptyState(),
      errors: { reload: false, fields: { reason: 'falta', costCenterId: 'falta' } },
    };
    const state = reducer(base, { type: 'setHeader', field: 'reason', value: 'Mantenimiento' });

    expect(state.reason).toBe('Mantenimiento');
    expect(state.errors.fields).toEqual({ costCenterId: 'falta' });
  });

  it('cambiar el equipo de la cabecera no modifica las líneas ya agregadas', () => {
    const state = run([add(FIL), { type: 'setHeader', field: 'equipmentId', value: EQ2 }]);

    expect(state.equipmentId).toBe(EQ2);
    expect(state.lines[0]?.equipmentId).toBe('');
  });

  it('setErrors y setNotice guardan lo que reciben', () => {
    const errors = { reload: true, general: 'Recarga', fields: {} };
    expect(reducer(emptyState(), { type: 'setErrors', errors }).errors).toEqual(errors);
    expect(reducer(emptyState(), { type: 'setNotice', notice: 'Hola' }).notice).toBe('Hola');
  });

  it('loaded reemplaza todo con la vista del servidor y conserva claves únicas', () => {
    const before = run([add(FIL), add(PER)]);
    const state = reducer(before, { type: 'loaded', request: view() });

    expect(state).toMatchObject({
      id: ID,
      version: 3,
      costCenterId: CC,
      equipmentId: EQ1,
      reason: 'Mantenimiento',
      errors: { reload: false, fields: {} },
    });
    expect(state.lines.map((l) => [l.code, l.quantity, l.unitPrice])).toEqual([
      ['FIL-1', '2.5', '12.5000'],
      ['PER-2', '3', '3.3333'],
    ]);
    const keys = [...before.lines, ...state.lines].map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('fromRequestView', () => {
  it('ignora las líneas quitadas y pasa null a ""', () => {
    const request = view({
      costCenterId: null,
      equipmentId: null,
      reason: null,
      lines: [
        { ...lineOf('FIL-1', '2.000', '12.5000'), status: 'removed' },
        lineOf('PER-2', '1.000', '3.3333'),
      ],
    });
    const state = fromRequestView(request);

    expect(state).toMatchObject({ costCenterId: '', equipmentId: '', reason: '' });
    expect(state.lines.map((l) => l.code)).toEqual(['PER-2']);
  });
});

describe('computeTotals', () => {
  it('coincide con el servidor: 2 × 12.5 + 3 × 3.3333 = 35.00 (HALF_UP)', () => {
    const state = run([
      add(FIL),
      add(PER),
      { type: 'setQuantity', key: 'k0', value: '2' },
      { type: 'setQuantity', key: 'k1', value: '3' },
    ]);
    const totals = computeTotals(state.lines);

    expect(totals.subtotals).toEqual({ k0: '25.00', k1: '10.00' });
    expect(totals.total).toBe('35.00');
  });

  it('redondea cada subtotal HALF_UP antes de sumar (0.005 sube a 0.01)', () => {
    const state = run([add({ ...FIL, referencePrice: '0.0050' })]);
    expect(computeTotals(state.lines)).toMatchObject({ subtotals: { k0: '0.01' }, total: '0.01' });
  });

  it('una cantidad inválida no suma y su subtotal es null', () => {
    const state = run([
      add(FIL),
      add(PER),
      { type: 'setQuantity', key: 'k0', value: 'abc' },
      { type: 'setQuantity', key: 'k1', value: '2' },
    ]);
    const totals = computeTotals(state.lines);

    expect(totals.subtotals.k0).toBeNull();
    expect(totals.total).toBe('6.67');
  });

  it('un producto sin precio aporta 0', () => {
    expect(computeTotals(run([add(SIN)]).lines).total).toBe('0.00');
  });

  it('sin líneas el total es 0.00', () => {
    expect(computeTotals([]).total).toBe('0.00');
  });

  it('si el monto no cabe en numeric(14,2) el total es null y no lanza', () => {
    const state = run([
      add({ ...FIL, referencePrice: '99999999.0000' }),
      { type: 'setQuantity', key: 'k0', value: '99999999999' },
    ]);
    expect(computeTotals(state.lines).total).toBeNull();
  });
});

describe('toDraftInput', () => {
  it('manda ids, cantidades y textos sin precios; los vacíos van como null', () => {
    const state = run([
      { type: 'setHeader', field: 'costCenterId', value: CC },
      { type: 'setHeader', field: 'reason', value: '  Motivo  ' },
      add(FIL),
      { type: 'setQuantity', key: 'k0', value: ' 2.5 ' },
    ]);

    expect(toDraftInput(state)).toEqual({
      costCenterId: CC,
      equipmentId: null,
      reason: 'Motivo',
      lines: [{ productId: FIL.id, quantity: '2.5', equipmentId: null, notes: null }],
    });
  });
});

describe('validaciones', () => {
  const complete = (): EditorState =>
    run([
      { type: 'setHeader', field: 'costCenterId', value: CC },
      { type: 'setHeader', field: 'reason', value: 'Motivo' },
      add(FIL),
    ]);

  it('guardar un borrador vacío es válido', () => {
    expect(hasErrors(validateForSave(emptyState()))).toBe(false);
  });

  it('guardar rechaza cantidades inválidas, con el índice de la línea', () => {
    const state = run([add(FIL), add(PER), { type: 'setQuantity', key: 'k1', value: '0' }]);
    const fields = validateForSave(state);

    expect(Object.keys(fields)).toEqual(['lines.1.quantity']);
    expect(lineError({ reload: false, fields }, 1, 'quantity')).toMatch(/mayor que cero/);
    expect(lineError({ reload: false, fields }, 0, 'quantity')).toBeUndefined();
  });

  it.each(['', '-1', '1,5', '1.2345', 'uno'])('guardar rechaza la cantidad %j', (value) => {
    const state = run([add(FIL), { type: 'setQuantity', key: 'k0', value }]);
    expect(hasErrors(validateForSave(state))).toBe(true);
  });

  it('enviar exige centro de costo, motivo y al menos un ítem', () => {
    expect(Object.keys(validateForSubmit(emptyState())).sort()).toEqual([
      'costCenterId',
      'lines',
      'reason',
    ]);
  });

  it('enviar rechaza un motivo de solo espacios', () => {
    const state = reducer(complete(), { type: 'setHeader', field: 'reason', value: '   ' });
    expect(Object.keys(validateForSubmit(state))).toEqual(['reason']);
  });

  it('enviar un borrador completo es válido', () => {
    expect(hasErrors(validateForSubmit(complete()))).toBe(false);
  });

  it('el equipo de cabecera es opcional', () => {
    expect(complete().equipmentId).toBe('');
    expect(hasErrors(validateForSubmit(complete()))).toBe(false);
  });
});

describe('errorsFromAction', () => {
  const base: ActionError = {
    code: 'VALIDATION',
    message: 'Revisa los datos marcados.',
    requestId: 'r',
  };

  it('lleva cada error de campo a su ruta (el primero) y deja root fuera', () => {
    const errors = errorsFromAction({
      ...base,
      fieldErrors: {
        costCenterId: ['Este centro de costo ya no está disponible.'],
        'lines.2.quantity': ['mal', 'otro'],
        root: ['x'],
      },
    });

    expect(errors.general).toBe('Revisa los datos marcados.');
    expect(errors.reload).toBe(false);
    expect(errors.fields).toEqual({
      costCenterId: 'Este centro de costo ya no está disponible.',
      'lines.2.quantity': 'mal',
    });
    expect(lineError(errors, 2, 'quantity')).toBe('mal');
  });

  it.each(['CONFLICT', 'INVALID_TRANSITION'] as const)('%s pide recargar', (code) => {
    expect(errorsFromAction({ ...base, code }).reload).toBe(true);
  });

  it.each(['VALIDATION', 'FORBIDDEN', 'NOT_FOUND', 'INTERNAL'] as const)(
    '%s no pide recargar',
    (code) => {
      expect(errorsFromAction({ ...base, code }).reload).toBe(false);
    },
  );
});

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

function lineOf(code: string, quantity: string, unitPrice: string): RequestView['lines'][number] {
  const index = code === 'FIL-1' ? 1 : 2;
  return {
    id: `99999999-9999-4999-8999-99999999999${index}`,
    lineNo: index,
    productId: `55555555-5555-4555-8555-55555555555${index}`,
    productCode: code,
    description: code === 'FIL-1' ? 'Filtro' : 'Perno',
    unit: 'UND',
    equipmentId: null,
    quantity,
    unitPrice,
    subtotal: '0.00',
    notes: null,
    status: 'active',
    revision: 1,
    needsReconfirmation: false,
  };
}

function view(overrides: Partial<RequestView> = {}): RequestView {
  return {
    id: ID,
    docType: 'SOF',
    number: null,
    status: 'draft',
    requesterId: '22222222-2222-4222-8222-222222222222',
    costCenterId: CC,
    warehouseId: '88888888-8888-4888-8888-888888888881',
    equipmentId: EQ1,
    reason: 'Mantenimiento',
    currency: 'PEN',
    totalAmount: '35.00',
    submittedAt: null,
    approvedAt: null,
    deliveredAt: null,
    closedAt: null,
    version: 3,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    lines: [lineOf('FIL-1', '2.500', '12.5000'), lineOf('PER-2', '3.000', '3.3333')],
    ...overrides,
  };
}
