// E4-H4 · Plan de edición en sitio de las líneas (puro).
import { describe, expect, it } from 'vitest';

import { planLineSync } from './line-sync';
import type { LineInsert, RequestLine } from './request';

const P1 = 'p1';
const P2 = 'p2';
const P3 = 'p3';

const existing = (
  id: string,
  lineNo: number,
  productId: string,
  extra: Partial<RequestLine> = {},
) =>
  ({
    id,
    lineNo,
    productId,
    productCode: `C-${productId}`,
    description: `D-${productId}`,
    unit: 'UND',
    equipmentId: null,
    quantity: '1.000',
    unitPrice: '10.0000',
    subtotal: '10.00',
    notes: null,
    status: 'active',
    revision: 1,
    needsReconfirmation: false,
    ...extra,
  }) satisfies RequestLine;

const desired = (productId: string, extra: Partial<LineInsert> = {}): LineInsert => ({
  lineNo: 0,
  productId,
  productCode: `C-${productId}`,
  description: `D-${productId}`,
  unit: 'UND',
  equipmentId: null,
  quantity: '1.000',
  unitPrice: '10.0000',
  subtotal: '10.00',
  notes: null,
  ...extra,
});

describe('planLineSync', () => {
  it('sin cambios no genera nada', () => {
    const plan = planLineSync(
      [existing('a', 1, P1), existing('b', 2, P2)],
      [desired(P1), desired(P2)],
    );
    expect(plan).toEqual({ updates: [], inserts: [], removed: [] });
  });

  it('actualiza en sitio la línea emparejada y conserva su lineNo', () => {
    const plan = planLineSync(
      [existing('a', 1, P1), existing('b', 2, P2)],
      [desired(P2, { quantity: '5.000', subtotal: '50.00' }), desired(P1)],
    );
    expect(
      plan.updates.map((u) => [u.id, u.line.lineNo, u.line.quantity, u.line.subtotal]),
    ).toEqual([['b', 2, '5.000', '50.00']]);
    expect(plan.inserts).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it('inserta las nuevas con el siguiente lineNo libre, incluso tras una quitada', () => {
    const plan = planLineSync(
      [existing('a', 1, P1), existing('b', 2, P2, { status: 'removed' })],
      [desired(P1), desired(P3), desired(P3)],
    );
    expect(plan.inserts.map((l) => [l.productId, l.lineNo])).toEqual([
      [P3, 3],
      [P3, 4],
    ]);
    expect(plan.removed).toEqual([]);
  });

  it('quita las vigentes sin pareja y no toca las ya quitadas', () => {
    const plan = planLineSync(
      [existing('a', 1, P1), existing('b', 2, P2), existing('c', 3, P3, { status: 'removed' })],
      [desired(P1)],
    );
    expect(plan.removed).toEqual(['b']);
  });

  it('con productos repetidos empareja en orden', () => {
    const plan = planLineSync(
      [existing('a', 1, P1), existing('b', 2, P1)],
      [desired(P1, { quantity: '3.000', subtotal: '30.00' }), desired(P1)],
    );
    expect(plan.updates.map((u) => u.id)).toEqual(['a']);
    expect(plan.removed).toEqual([]);
  });
});
