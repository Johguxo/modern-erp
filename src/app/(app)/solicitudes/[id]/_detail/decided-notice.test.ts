import { describe, expect, it } from 'vitest';

import { decidedNotice } from './decided-notice';

describe('decidedNotice', () => {
  it.each([
    ['approved', 'approved', 'Aprobaste SOF-1. Quedó aprobada.'],
    ['rejected', 'rejected', 'Rechazaste SOF-1.'],
    ['changes_requested', 'changes_requested', 'Pediste cambios en SOF-1.'],
    ['advanced', 'in_approval', 'Aprobaste SOF-1. Pasa al siguiente paso de aprobación.'],
    ['partial', 'in_approval', 'Aprobaste SOF-1. Faltan otros aprobadores de este paso.'],
  ] as const)('%s con la solicitud en %s muestra el aviso', (param, status, text) => {
    expect(decidedNotice(param, status, true, 'SOF-1')).toEqual({ tone: 'success', text });
  });

  it.each([
    ['approved', 'in_approval'],
    ['rejected', 'approved'],
    ['changes_requested', 'in_approval'],
    ['advanced', 'approved'],
    ['partial', 'rejected'],
  ] as const)('%s no coincide con el estado %s: sin aviso', (param, status) => {
    expect(decidedNotice(param, status, true, 'SOF-1')).toBeUndefined();
  });

  it('sin aviso para el dueño, un valor desconocido o un parámetro no textual', () => {
    expect(decidedNotice('approved', 'approved', false, 'SOF-1')).toBeUndefined();
    expect(decidedNotice('hack', 'approved', true, 'SOF-1')).toBeUndefined();
    expect(decidedNotice(['approved'], 'approved', true, 'SOF-1')).toBeUndefined();
    expect(decidedNotice(undefined, 'approved', true, 'SOF-1')).toBeUndefined();
  });
});
