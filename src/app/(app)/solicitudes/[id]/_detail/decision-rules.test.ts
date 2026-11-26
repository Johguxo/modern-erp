import { describe, expect, it } from 'vitest';

import { commentRequired, needsReload } from './decision-rules';

describe('commentRequired', () => {
  it.each([
    ['approve', false],
    ['reject', true],
    ['request_changes', true],
  ] as const)('%s -> %s', (decision, expected) => {
    expect(commentRequired(decision)).toBe(expected);
  });
});

describe('needsReload', () => {
  it.each([
    [{ code: 'CONFLICT' }, true],
    [{ code: 'INVALID_TRANSITION' }, true],
    [{ code: 'FORBIDDEN', reason: 'step_already_decided' }, true],
    [{ code: 'FORBIDDEN', reason: 'not_an_approver' }, true],
    [{ code: 'VALIDATION', reason: 'approval_not_started' }, true],
    [{ code: 'VALIDATION', reason: 'decision_comment_required' }, false],
    [{ code: 'VALIDATION' }, false],
    [{ code: 'INTERNAL' }, false],
  ])('%j -> %s', (error, expected) => {
    expect(needsReload(error)).toBe(expected);
  });
});
