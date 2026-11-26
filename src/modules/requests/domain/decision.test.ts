import { describe, expect, it } from 'vitest';

import {
  DECISION_COMMENT_MAX,
  normalizeDecisionComment,
  statusAfterDecision,
  type DecisionOutcome,
} from './decision';

describe('normalizeDecisionComment', () => {
  it('aprobar admite comentario vacío (null) o con texto recortado', () => {
    expect(normalizeDecisionComment('approve', undefined)).toBeNull();
    expect(normalizeDecisionComment('approve', '   ')).toBeNull();
    expect(normalizeDecisionComment('approve', '  Conforme  ')).toBe('Conforme');
  });

  it.each(['reject', 'request_changes'] as const)('%s exige comentario', (kind) => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(() => normalizeDecisionComment(kind, raw)).toThrowError(
        expect.objectContaining({ code: 'VALIDATION', reason: 'decision_comment_required' }),
      );
    }
    expect(normalizeDecisionComment(kind, ' Falta el equipo ')).toBe('Falta el equipo');
  });

  it('acepta 500 caracteres y rechaza 501', () => {
    expect(normalizeDecisionComment('reject', 'a'.repeat(DECISION_COMMENT_MAX))).toHaveLength(500);
    expect(() =>
      normalizeDecisionComment('approve', 'a'.repeat(DECISION_COMMENT_MAX + 1)),
    ).toThrowError(
      expect.objectContaining({ reason: 'decision_comment_too_long', params: { max: 500 } }),
    );
  });
});

describe('statusAfterDecision', () => {
  const cases: [DecisionOutcome, string][] = [
    ['approved', 'approved'],
    ['rejected', 'rejected'],
    ['changes_requested', 'changes_requested'],
    ['partial', 'in_approval'],
    ['advanced', 'in_approval'],
  ];

  it.each(cases)('desde in_approval, %s → %s', (outcome, status) => {
    expect(statusAfterDecision('in_approval', outcome)).toBe(status);
  });

  it.each(['draft', 'approved', 'rejected', 'cancelled', 'changes_requested'] as const)(
    'desde %s no se puede decidir',
    (status) => {
      for (const [outcome] of cases) {
        expect(() => statusAfterDecision(status, outcome)).toThrowError(
          expect.objectContaining({ code: 'INVALID_TRANSITION' }),
        );
      }
    },
  );
});
