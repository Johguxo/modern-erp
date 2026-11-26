import { describe, expect, it } from 'vitest';

import type { Ctx } from '@/shared/context';
import { InvalidTransitionError, ValidationError } from '@/shared/errors';
import type { Permission } from '@/shared/permissions';

import {
  EDITABLE_STATUSES,
  MAX_LINES,
  assertEditable,
  assertSubmittable,
  canView,
  snapshotOf,
  type RequestLine,
} from './request';
import { REQUEST_STATUSES } from './request-state-machine';

const viewer = (
  userId: string,
  permissions: Permission[] = [],
): Pick<Ctx, 'userId' | 'permissions'> => ({
  userId,
  permissions: new Set(permissions),
});

describe('assertEditable', () => {
  it('solo se edita en borrador o con cambios solicitados', () => {
    expect(EDITABLE_STATUSES).toEqual(['draft', 'changes_requested']);
    expect(() => assertEditable('draft')).not.toThrow();
    expect(() => assertEditable('changes_requested')).not.toThrow();
    for (const status of REQUEST_STATUSES.filter((s) => !EDITABLE_STATUSES.includes(s))) {
      expect(() => assertEditable(status)).toThrow(InvalidTransitionError);
    }
  });

  it('el error lleva el estado y el motivo', () => {
    let error: unknown;
    try {
      assertEditable('approved');
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      from: 'approved',
      event: 'edit',
      reason: 'request_not_editable',
    });
  });
});

describe('assertSubmittable (G5)', () => {
  const complete = { costCenterId: 'cc', reason: 'Mantenimiento', activeLineCount: 1 };

  it('acepta centro de costo, motivo y una línea', () => {
    expect(() => assertSubmittable(complete)).not.toThrow();
  });

  it('el equipo de cabecera es opcional (no se pide)', () => {
    expect(() => assertSubmittable(complete)).not.toThrow();
  });

  it.each([
    ['sin centro de costo', { ...complete, costCenterId: null }, ['costCenterId']],
    ['sin motivo', { ...complete, reason: null }, ['reason']],
    ['motivo en blanco', { ...complete, reason: '   ' }, ['reason']],
    ['sin líneas', { ...complete, activeLineCount: 0 }, ['lines']],
    [
      'todo vacío',
      { costCenterId: null, reason: null, activeLineCount: 0 },
      ['costCenterId', 'reason', 'lines'],
    ],
  ])('%s → request_incomplete', (_name, parts, fields) => {
    let error: unknown;
    try {
      assertSubmittable(parts);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ reason: 'request_incomplete' });
    expect(Object.keys((error as ValidationError).fieldErrors).sort()).toEqual([...fields].sort());
  });
});

describe('canView', () => {
  it('lo nunca enviado (sin número) solo lo ve su solicitante, aunque otro tenga read_all', () => {
    const draft = { requesterId: 'u1', number: null };
    expect(canView(draft, viewer('u1'))).toBe(true);
    expect(canView(draft, viewer('u2', ['requests.read_all']))).toBe(false);
  });

  it('lo enviado (con número) lo ve el solicitante o requests.read_all', () => {
    const sent = { requesterId: 'u1', number: 'SOF-0001' };
    expect(canView(sent, viewer('u1'))).toBe(true);
    expect(canView(sent, viewer('u2', ['requests.read_all']))).toBe(true);
    expect(canView(sent, viewer('u2', ['requests.read_own']))).toBe(false);
    expect(canView(sent, viewer('u2'))).toBe(false);
  });

  it('el aprobador asignado ve lo enviado, pero nunca lo que no tiene número', () => {
    const sent = { requesterId: 'u1', number: 'SOF-0001' };
    const unsent = { requesterId: 'u1', number: null };
    expect(canView(sent, viewer('u2', ['requests.read_own']), { assigned: true })).toBe(true);
    expect(canView(sent, viewer('u2', ['requests.read_own']), { assigned: false })).toBe(false);
    expect(canView(unsent, viewer('u2', ['requests.read_own']), { assigned: true })).toBe(false);
  });
});

describe('snapshotOf', () => {
  it('copia la línea con el dinero como texto', () => {
    const line: RequestLine = {
      id: 'l1',
      lineNo: 2,
      productId: 'p1',
      productCode: 'FIL-1',
      description: 'Filtro',
      unit: 'UND',
      equipmentId: null,
      quantity: '2.000',
      unitPrice: '12.5000',
      subtotal: '25.00',
      notes: null,
      status: 'active',
      revision: 1,
      needsReconfirmation: false,
    };
    const snapshot = snapshotOf(line);
    expect(snapshot).toMatchObject({ lineNo: 2, quantity: '2.000', subtotal: '25.00' });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('el tope de líneas es 200', () => {
    expect(MAX_LINES).toBe(200);
  });
});
