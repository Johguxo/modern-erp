// E0-H3 · DomainError y subclases, con su mapeo a respuestas HTTP.
import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  ERROR_CODES,
  ForbiddenError,
  HTTP_STATUS_BY_CODE,
  httpStatusOf,
  InvalidTransitionError,
  isDomainError,
  LimitExceededError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  type DomainError,
} from './errors';

const CASES: [name: string, code: string, status: number, make: () => DomainError][] = [
  ['NotFoundError', 'NOT_FOUND', 404, () => new NotFoundError()],
  ['ForbiddenError', 'FORBIDDEN', 403, () => new ForbiddenError()],
  ['UnauthenticatedError', 'UNAUTHENTICATED', 401, () => new UnauthenticatedError()],
  ['ValidationError', 'VALIDATION', 422, () => new ValidationError()],
  ['ConflictError', 'CONFLICT', 409, () => new ConflictError()],
  [
    'InvalidTransitionError',
    'INVALID_TRANSITION',
    409,
    () => new InvalidTransitionError({ from: 'draft', event: 'approve' }),
  ],
  ['LimitExceededError', 'LIMIT_EXCEEDED', 403, () => new LimitExceededError()],
];

describe('DomainError y subclases con su mapeo a HTTP', () => {
  it.each(CASES)('%s tiene code %s y HTTP %i', (name, code, status, make) => {
    const error = make();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(httpStatusOf(error)).toBe(status);
    expect(isDomainError(error)).toBe(true);
  });

  it('todo ErrorCode tiene código HTTP (BAD_REQUEST 400, INTERNAL 500)', () => {
    for (const code of ERROR_CODES) expect(HTTP_STATUS_BY_CODE[code]).toBeTypeOf('number');
    expect(HTTP_STATUS_BY_CODE.BAD_REQUEST).toBe(400);
    expect(HTTP_STATUS_BY_CODE.INTERNAL).toBe(500);
  });

  it('un Error genérico no es de dominio y su HTTP es 500', () => {
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(httpStatusOf(new Error('boom'))).toBe(500);
    expect(httpStatusOf('boom')).toBe(500);
    expect(httpStatusOf(null)).toBe(500);
  });

  it('isDomainError reconoce la marca Symbol.for de otra copia del módulo (sin instanceof)', () => {
    const fromOtherBundle = { [Symbol.for('linkus.DomainError')]: true, code: 'NOT_FOUND' };

    expect(isDomainError(fromOtherBundle)).toBe(true);
    expect(httpStatusOf(fromOtherBundle)).toBe(404);
    expect(isDomainError({ code: 'NOT_FOUND' })).toBe(false);
    expect(isDomainError(undefined)).toBe(false);
  });

  it('guarda reason, params, message interno y cause', () => {
    const cause = new Error('driver');
    const error = new LimitExceededError({
      reason: 'max_users',
      params: { max: 10 },
      message: 'Plan limit reached',
      cause,
    });

    expect(error.reason).toBe('max_users');
    expect(error.params).toEqual({ max: 10 });
    expect(error.message).toBe('Plan limit reached');
    expect(error.cause).toBe(cause);
    expect(new NotFoundError().params).toEqual({});
    expect(new NotFoundError().reason).toBeUndefined();
  });

  it('InvalidTransitionError guarda from y event', () => {
    const error = new InvalidTransitionError({ from: 'approved', event: 'submit' });

    expect(error.from).toBe('approved');
    expect(error.event).toBe('submit');
    expect(error.message).toContain('submit');
    expect(error.message).toContain('approved');
  });

  it('ValidationError guarda fieldErrors (vacío por defecto)', () => {
    const fieldErrors = { 'lines.0.quantity': ['Debe ser al menos 1.'] };

    expect(new ValidationError({ fieldErrors }).fieldErrors).toEqual(fieldErrors);
    expect(new ValidationError().fieldErrors).toEqual({});
  });
});
