import { describe, expect, it } from 'vitest';

import { InvalidTransitionError } from '@/shared/errors';

import {
  REQUEST_EVENTS,
  REQUEST_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  nextStatus,
  type RequestEvent,
  type RequestStatus,
} from './request-state-machine';

// Tabla del §1 de docs/dominio/flujo-sof-aprobaciones.md, escrita aparte de la implementación.
const VALID: readonly (readonly [RequestStatus, RequestEvent, RequestStatus])[] = [
  ['draft', 'submit', 'in_approval'],
  ['draft', 'cancel', 'cancelled'],
  ['in_approval', 'approve', 'approved'],
  ['in_approval', 'reject', 'rejected'],
  ['in_approval', 'request_changes', 'changes_requested'],
  ['in_approval', 'correct_line', 'in_approval'],
  ['in_approval', 'cancel', 'cancelled'],
  ['changes_requested', 'resubmit', 'in_approval'],
  ['changes_requested', 'cancel', 'cancelled'],
  ['approved', 'correct_line', 'approved'],
  ['approved', 'deliver', 'delivered'],
  ['approved', 'cancel', 'cancelled'],
];

describe('nextStatus: todas las combinaciones estado × evento', () => {
  it('cubre 7 estados × 8 eventos', () => {
    expect(REQUEST_STATUSES).toHaveLength(7);
    expect(REQUEST_EVENTS).toHaveLength(8);
  });

  for (const from of REQUEST_STATUSES) {
    for (const event of REQUEST_EVENTS) {
      const valid = VALID.find(([f, e]) => f === from && e === event);
      if (valid) {
        it(`${from} + ${event} → ${valid[2]}`, () => {
          expect(canTransition(from, event)).toBe(true);
          expect(nextStatus(from, event)).toBe(valid[2]);
        });
      } else {
        it(`${from} + ${event} es inválida`, () => {
          expect(canTransition(from, event)).toBe(false);
          let error: unknown;
          try {
            nextStatus(from, event);
          } catch (caught) {
            error = caught;
          }
          expect(error).toBeInstanceOf(InvalidTransitionError);
          expect(error).toMatchObject({ code: 'INVALID_TRANSITION', from, event });
        });
      }
    }
  }
});

describe('correct_line desde approved', () => {
  it('sin reconfirmar se queda en approved', () => {
    expect(nextStatus('approved', 'correct_line')).toBe('approved');
    expect(nextStatus('approved', 'correct_line', { reconfirm: false })).toBe('approved');
  });

  it('con reconfirmación vuelve a in_approval', () => {
    expect(nextStatus('approved', 'correct_line', { reconfirm: true })).toBe('in_approval');
  });

  it('reconfirm no cambia las demás transiciones', () => {
    expect(nextStatus('in_approval', 'correct_line', { reconfirm: true })).toBe('in_approval');
    expect(nextStatus('draft', 'submit', { reconfirm: true })).toBe('in_approval');
  });

  it('desde un estado donde no aplica sigue siendo inválida', () => {
    expect(() => nextStatus('draft', 'correct_line', { reconfirm: true })).toThrow(
      InvalidTransitionError,
    );
  });
});

describe('estados finales', () => {
  it('delivered, rejected y cancelled no admiten ningún evento', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'delivered', 'rejected']);
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      for (const event of REQUEST_EVENTS) expect(canTransition(status, event)).toBe(false);
    }
  });

  it('los demás estados no son finales', () => {
    for (const status of ['draft', 'in_approval', 'changes_requested', 'approved'] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});
