// E4-H4 · Aplicar una corrección a las líneas vigentes (puro).
import { describe, expect, it } from 'vitest';

import { applyLineCorrection, normalizeCorrectionReason, type LineValues } from './line-correction';
import type { RequestLine } from './request';

const line = (id: string, lineNo: number, extra: Partial<RequestLine> = {}): RequestLine => ({
  id,
  lineNo,
  productId: `prod-${id}`,
  productCode: `C-${id}`,
  description: `D-${id}`,
  unit: 'UND',
  equipmentId: null,
  quantity: '2.000',
  unitPrice: '10.0000',
  subtotal: '20.00',
  notes: null,
  status: 'active',
  revision: 1,
  needsReconfirmation: false,
  ...extra,
});

const A = line('a', 1);
const B = line('b', 2, { unitPrice: '5.5000', subtotal: '11.00' });
const LINES = [A, B];

const valuesOf = (base: RequestLine, extra: Partial<LineValues> = {}): LineValues => ({
  productId: base.productId,
  productCode: base.productCode,
  description: base.description,
  unit: base.unit,
  equipmentId: base.equipmentId,
  quantity: base.quantity,
  unitPrice: base.unitPrice,
  notes: base.notes,
  ...extra,
});

describe('applyLineCorrection · corregir', () => {
  it('cambiar solo el equipo no cambia el total', () => {
    const applied = applyLineCorrection(LINES, {
      type: 'update',
      lineId: 'a',
      values: valuesOf(A, { equipmentId: 'eq-1' }),
    });
    expect(applied.changedFields).toEqual(['equipmentId']);
    expect(applied.previousTotal).toBe('31.00');
    expect(applied.newTotal).toBe('31.00');
    expect(applied.next?.lineNo).toBe(1);
    expect(applied.before?.equipmentId).toBeNull();
    expect(applied.after?.equipmentId).toBe('eq-1');
  });

  it('subir la cantidad recalcula subtotal y total con decimales exactos', () => {
    const applied = applyLineCorrection(LINES, {
      type: 'update',
      lineId: 'b',
      values: valuesOf(B, { quantity: '3.333' }),
    });
    expect(applied.changedFields).toEqual(['quantity']);
    expect(applied.after?.subtotal).toBe('18.33');
    expect(applied.newTotal).toBe('38.33');
  });

  it('cambiar producto y precio lista ambos campos', () => {
    const applied = applyLineCorrection(LINES, {
      type: 'update',
      lineId: 'a',
      values: valuesOf(A, { productId: 'otro', unitPrice: '1.0000' }),
    });
    expect(applied.changedFields).toEqual(['productId', 'unitPrice']);
    expect(applied.newTotal).toBe('13.00');
  });

  it('una corrección que no cambia nada falla con line_unchanged', () => {
    expect(() =>
      applyLineCorrection(LINES, { type: 'update', lineId: 'a', values: valuesOf(A) }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION', reason: 'line_unchanged' }));
  });

  it('una línea inexistente o ya quitada es 404 line_not_found', () => {
    const withRemoved = [...LINES, line('c', 3, { status: 'removed' })];
    for (const lineId of ['zzz', 'c']) {
      expect(() =>
        applyLineCorrection(withRemoved, { type: 'update', lineId, values: valuesOf(A) }),
      ).toThrow(expect.objectContaining({ code: 'NOT_FOUND', reason: 'line_not_found' }));
    }
  });
});

describe('applyLineCorrection · agregar y quitar', () => {
  it('agregar toma el siguiente lineNo libre, incluso tras una quitada', () => {
    const lines = [...LINES, line('c', 3, { status: 'removed', subtotal: '99.00' })];
    const applied = applyLineCorrection(lines, {
      type: 'add',
      values: valuesOf(A, { productId: 'nuevo', quantity: '1.000', unitPrice: '4.0000' }),
    });
    expect(applied.next?.lineNo).toBe(4);
    expect(applied.next?.subtotal).toBe('4.00');
    expect(applied.before).toBeNull();
    expect(applied.previousTotal).toBe('31.00');
    expect(applied.newTotal).toBe('35.00');
  });

  it('quitar baja el total y no cuenta las líneas ya quitadas', () => {
    const lines = [...LINES, line('c', 3, { status: 'removed', subtotal: '99.00' })];
    const applied = applyLineCorrection(lines, { type: 'remove', lineId: 'a' });
    expect(applied.next).toBeNull();
    expect(applied.after).toBeNull();
    expect(applied.before?.lineNo).toBe(1);
    expect(applied.previousTotal).toBe('31.00');
    expect(applied.newTotal).toBe('11.00');
  });

  it('quitar la última línea vigente falla con last_line', () => {
    const lines = [line('a', 1), line('b', 2, { status: 'removed' })];
    expect(() => applyLineCorrection(lines, { type: 'remove', lineId: 'a' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION', reason: 'last_line' }),
    );
  });

  it('un monto que no cabe en la base falla con amount_too_large', () => {
    expect(() =>
      applyLineCorrection(LINES, {
        type: 'add',
        values: valuesOf(A, { quantity: '99999999999.000', unitPrice: '99999.0000' }),
      }),
    ).toThrow(expect.objectContaining({ reason: 'amount_too_large' }));
  });
});

describe('normalizeCorrectionReason', () => {
  it('recorta los bordes', () => {
    expect(normalizeCorrectionReason('  Se registró el equipo equivocado ')).toBe(
      'Se registró el equipo equivocado',
    );
  });

  it.each([null, undefined, '', '   '])('rechaza un motivo vacío (%j)', (raw) => {
    expect(() => normalizeCorrectionReason(raw)).toThrow(
      expect.objectContaining({ code: 'VALIDATION', reason: 'correction_reason_required' }),
    );
  });

  it('rechaza más de 500 caracteres', () => {
    expect(() => normalizeCorrectionReason('x'.repeat(501))).toThrow(
      expect.objectContaining({ reason: 'correction_reason_too_long' }),
    );
    expect(normalizeCorrectionReason('x'.repeat(500))).toHaveLength(500);
  });
});
