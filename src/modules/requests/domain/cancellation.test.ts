// E3-H5 · Reglas de anulación: quién anula, en qué estado y qué comentario se acepta.
import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from '@/modules/identity';
import { ForbiddenError, InvalidTransitionError, ValidationError } from '@/shared/errors';
import type { Permission, Role } from '@/shared/permissions';

import {
  assertCanCancel,
  canCancel,
  normalizeCancelComment,
  OWNER_CANCELLABLE,
} from './cancellation';
import { CANCEL_COMMENT_MAX } from './request';
import { REQUEST_STATUSES, type RequestStatus } from './request-state-machine';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const viewer = (role: Role, userId: string) => ({
  userId,
  permissions: new Set<Permission>(ROLE_PERMISSIONS[role]),
});
const request = (status: RequestStatus) => ({ status, requesterId: OWNER });

describe('canCancel', () => {
  const table: [RequestStatus, Role, string, boolean][] = [
    ['draft', 'requester', OWNER, true],
    ['in_approval', 'requester', OWNER, true],
    ['changes_requested', 'requester', OWNER, true],
    ['approved', 'requester', OWNER, false],
    ['delivered', 'requester', OWNER, false],
    ['rejected', 'requester', OWNER, false],
    ['cancelled', 'requester', OWNER, false],
    ['draft', 'admin', OTHER, false],
    ['in_approval', 'admin', OTHER, true],
    ['changes_requested', 'admin', OTHER, true],
    ['approved', 'admin', OTHER, true],
    ['delivered', 'admin', OTHER, false],
    ['rejected', 'admin', OTHER, false],
    ['cancelled', 'admin', OTHER, false],
    ['approved', 'admin', OWNER, true],
    ['in_approval', 'warehouse', OTHER, false],
    ['approved', 'warehouse', OTHER, false],
    ['in_approval', 'approver', OWNER, false],
    ['in_approval', 'requester', OTHER, false],
  ];
  it.each(table)('%s · %s (%s) → %s', (status, role, userId, expected) => {
    expect(canCancel(request(status), viewer(role, userId))).toBe(expected);
  });

  it('el dueño solo anula los estados de OWNER_CANCELLABLE', () => {
    expect(OWNER_CANCELLABLE).toEqual(['draft', 'in_approval', 'changes_requested']);
    for (const status of REQUEST_STATUSES) {
      expect(canCancel(request(status), viewer('requester', OWNER))).toBe(
        OWNER_CANCELLABLE.includes(status),
      );
    }
  });
});

describe('assertCanCancel', () => {
  it('devuelve cancelled cuando se puede', () => {
    expect(assertCanCancel(request('in_approval'), viewer('requester', OWNER))).toBe('cancelled');
  });

  it('un estado final lanza InvalidTransitionError (antes que Forbidden)', () => {
    for (const status of ['delivered', 'rejected', 'cancelled'] as const) {
      expect(() => assertCanCancel(request(status), viewer('warehouse', OTHER))).toThrow(
        InvalidTransitionError,
      );
    }
  });

  it('sin derecho lanza Forbidden cancel_not_allowed', () => {
    let error: unknown;
    try {
      assertCanCancel(request('approved'), viewer('requester', OWNER));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ reason: 'cancel_not_allowed' });
  });
});

describe('normalizeCancelComment', () => {
  it('recorta los espacios de los bordes', () => {
    expect(normalizeCancelComment('  Duplicada \n')).toBe('Duplicada');
  });

  it('acepta exactamente 500 caracteres', () => {
    expect(normalizeCancelComment('a'.repeat(CANCEL_COMMENT_MAX))).toHaveLength(500);
  });

  it.each([
    ['vacío', '', 'cancel_comment_required'],
    ['solo espacios', '  \n\t ', 'cancel_comment_required'],
    ['501 caracteres', 'a'.repeat(501), 'cancel_comment_too_long'],
  ])('%s → ValidationError', (_name, raw, reason) => {
    let error: unknown;
    try {
      normalizeCancelComment(raw);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ reason, fieldErrors: { comment: [reason] } });
  });
});
