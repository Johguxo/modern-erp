import { describe, expect, it } from 'vitest';

import { parseStepCondition, stepApplies } from './step-condition';

describe('stepApplies', () => {
  it('sin condición el paso aplica', () => {
    expect(stepApplies({}, '10.00')).toBe(true);
    expect(stepApplies({}, null)).toBe(true);
  });

  it('con min_amount aplica solo si el total lo alcanza (límite inclusive)', () => {
    const condition = { min_amount: '5000.00' };
    expect(stepApplies(condition, '4999.99')).toBe(false);
    expect(stepApplies(condition, '5000.00')).toBe(true);
    expect(stepApplies(condition, '5000.01')).toBe(true);
  });

  it('compara con decimales exactos, sin errores de punto flotante', () => {
    expect(stepApplies({ min_amount: '0.30' }, '0.30')).toBe(true);
    expect(stepApplies({ min_amount: '0.30' }, '0.29')).toBe(false);
  });

  it('un total nulo cuenta como 0', () => {
    expect(stepApplies({ min_amount: '1.00' }, null)).toBe(false);
    expect(stepApplies({ min_amount: '0' }, null)).toBe(true);
  });

  it('una condición desconocida o inválida hace que el paso aplique', () => {
    expect(stepApplies({ cost_center_ids: ['a'] }, '1.00')).toBe(true);
    expect(stepApplies({ min_amount: 5000 }, '1.00')).toBe(true);
    expect(stepApplies({ min_amount: 'mucho' }, '1.00')).toBe(true);
  });
});

describe('parseStepCondition', () => {
  it('devuelve el monto mínimo o null', () => {
    expect(parseStepCondition({ min_amount: '12.50' })).toEqual({ minAmount: '12.50' });
    expect(parseStepCondition({})).toEqual({ minAmount: null });
    expect(parseStepCondition('texto')).toEqual({ minAmount: null });
  });
});
