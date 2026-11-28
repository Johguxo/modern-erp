import { describe, expect, it } from 'vitest';

import type { RequestDetailLine } from '@/modules/requests';

import {
  buildInput,
  initialFormState,
  pickProduct,
  selectLine,
  selectMode,
  serverFieldErrors,
} from './correct-line-form';

const REQ = '00000000-0000-4000-8000-000000000001';
const P1 = '55555555-5555-4555-8555-555555555551';
const P2 = '55555555-5555-4555-8555-555555555552';
const EQ = '77777777-7777-4777-8777-777777777771';

const line = (n: number, overrides: Partial<RequestDetailLine> = {}): RequestDetailLine => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  lineNo: n,
  productCode: `P-${n}`,
  description: `Producto ${n}`,
  unit: 'UND',
  quantity: '2.000',
  subtotal: '10.00',
  equipmentLabel: null,
  productId: P1,
  equipmentId: null,
  notes: null,
  unitPrice: '5.0000',
  revision: 1,
  needsReconfirmation: false,
  highlighted: false,
  ...overrides,
});
const lines = [line(1), line(2, { productId: P2, equipmentId: EQ, notes: 'urgente' })];
const target = { id: REQ, version: 4 };

describe('estado inicial y cambio de modo', () => {
  it('empieza corrigiendo la primera línea, con sus valores actuales', () => {
    expect(initialFormState(lines)).toMatchObject({
      mode: 'update',
      lineId: lines[0]?.id,
      productId: P1,
      productLabel: 'P-1 · Producto 1',
      quantity: '2',
      unitPrice: '5.00',
      equipmentId: '',
      notes: '',
      reason: '',
    });
  });

  it('elegir otra línea la rellena; el motivo se conserva', () => {
    const typed = { ...initialFormState(lines), reason: 'Porque sí' };
    const next = selectLine(typed, lines[1]?.id ?? '', lines);
    expect(next).toMatchObject({ productId: P2, equipmentId: EQ, notes: 'urgente' });
    expect(next.reason).toBe('Porque sí');
  });

  it('agregar parte en blanco con cantidad 1; volver a corregir recupera la línea', () => {
    const typed = { ...initialFormState(lines), reason: 'Falta uno' };
    const add = selectMode(typed, 'add', lines);
    expect(add).toMatchObject({ mode: 'add', lineId: '', productId: '', quantity: '1' });
    expect(add.reason).toBe('Falta uno');
    expect(selectMode(add, 'update', lines)).toMatchObject({ mode: 'update', productId: P1 });
    expect(selectMode(typed, 'update', lines)).toBe(typed);
  });
});

describe('pickProduct', () => {
  it('trae el precio de referencia, o 0 si no tiene', () => {
    const state = initialFormState(lines);
    const product = { id: P2, code: 'P-9', name: 'Nuevo', referencePrice: '12.5000' };
    expect(pickProduct(state, product)).toMatchObject({
      productId: P2,
      productLabel: 'P-9 · Nuevo',
      unitPrice: '12.50',
    });
    expect(pickProduct(state, { ...product, referencePrice: null }).unitPrice).toBe('0.00');
  });
});

describe('buildInput', () => {
  it('corregir manda todos los campos como texto y el motivo sin bordes', () => {
    const state = {
      ...initialFormState(lines),
      equipmentId: EQ,
      quantity: ' 3.5 ',
      reason: '  Más  ',
    };
    expect(buildInput(state, target)).toEqual({
      ok: true,
      input: {
        id: REQ,
        version: 4,
        reason: 'Más',
        change: {
          type: 'update',
          lineId: lines[0]?.id,
          productId: P1,
          quantity: '3.5',
          unitPrice: '5.00',
          equipmentId: EQ,
          notes: null,
        },
      },
    });
  });

  it('agregar no lleva lineId; quitar solo lleva la línea', () => {
    const add = {
      ...selectMode(initialFormState(lines), 'add', lines),
      productId: P2,
      unitPrice: '1',
      reason: 'Falta',
    };
    const built = buildInput(add, target);
    expect(built.ok && built.input.change).toMatchObject({ type: 'add', productId: P2 });
    expect(built.ok && 'lineId' in built.input.change).toBe(false);

    const remove = { ...selectMode(initialFormState(lines), 'remove', lines), reason: 'Sobra' };
    expect(buildInput(remove, target)).toEqual({
      ok: true,
      input: {
        id: REQ,
        version: 4,
        reason: 'Sobra',
        change: { type: 'remove', lineId: lines[0]?.id },
      },
    });
  });

  it('el motivo es obligatorio y tiene tope de 500', () => {
    const base = initialFormState(lines);
    const empty = buildInput({ ...base, reason: '   ' }, target);
    expect(!empty.ok && empty.errors.reason).toBe('Escribe el motivo de la corrección.');
    const long = buildInput({ ...base, reason: 'a'.repeat(501) }, target);
    expect(!long.ok && long.errors.reason).toContain('500');
    expect(buildInput({ ...base, reason: 'a'.repeat(500) }, target).ok).toBe(true);
  });

  it('valida cantidad, precio y producto; quitar no los pide', () => {
    const bad = buildInput(
      { ...initialFormState(lines), quantity: '0', unitPrice: '-1', productId: '', reason: 'x' },
      target,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(['productId', 'quantity', 'unitPrice']);
    }
    const remove = {
      ...selectMode(initialFormState(lines), 'remove', lines),
      quantity: 'zzz',
      reason: 'x',
    };
    expect(buildInput(remove, target).ok).toBe(true);
  });

  it('las notas pasan de 500 caracteres: error', () => {
    const built = buildInput(
      { ...initialFormState(lines), notes: 'n'.repeat(501), reason: 'x' },
      target,
    );
    expect(!built.ok && built.errors.notes).toContain('500');
  });
});

describe('serverFieldErrors', () => {
  it('ubica cada error por el último tramo de la ruta', () => {
    expect(
      serverFieldErrors({
        'change.quantity': ['Cantidad mala'],
        lineId: ['No cambiaste nada en este ítem.'],
        reason: ['Motivo', 'otro'],
      }),
    ).toEqual({
      quantity: 'Cantidad mala',
      lineId: 'No cambiaste nada en este ítem.',
      reason: 'Motivo',
    });
    expect(serverFieldErrors(undefined)).toEqual({});
  });
});
