// E0-H3 · Traducción de errores a código + mensaje es-PE + requestId, sin detalles técnicos.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { notFound, redirect } from 'next/navigation';
import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  ERROR_CODES,
  ForbiddenError,
  InvalidTransitionError,
  LimitExceededError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/shared/errors';
import { messages } from '@/ui/messages/es-PE';

import { errorOf, toActionError } from './error-response';

const REQUEST_ID = 'req-errors-0001';
const SECRET = 'select * from users where dni = 12345678';

function thrown(fn: () => never): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('No lanzó');
}

describe('toActionError', () => {
  it('cada ErrorCode tiene mensaje en es-PE', () => {
    for (const code of ERROR_CODES) {
      expect(messages.errors.codes[code]).toMatch(/\S/);
      expect(errorOf(code, REQUEST_ID)).toEqual({
        code,
        message: messages.errors.codes[code],
        requestId: REQUEST_ID,
      });
    }
  });

  it.each([
    ['NOT_FOUND', new NotFoundError({ message: SECRET })],
    ['FORBIDDEN', new ForbiddenError({ message: SECRET })],
    ['UNAUTHENTICATED', new UnauthenticatedError({ message: SECRET })],
    ['CONFLICT', new ConflictError({ message: SECRET })],
    ['INVALID_TRANSITION', new InvalidTransitionError({ from: 'a', event: 'b', message: SECRET })],
    ['LIMIT_EXCEEDED', new LimitExceededError({ message: SECRET })],
  ] as const)('%s: mensaje del código, con requestId y sin Error.message', (code, error) => {
    const result = toActionError(error, REQUEST_ID, new CapturingLogger());

    expect(result).toEqual({
      code,
      message: messages.errors.codes[code],
      fieldErrors: undefined,
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('una reason conocida con params gana sobre el mensaje del código (max_users)', () => {
    const error = new LimitExceededError({ reason: 'max_users', params: { max: 10 } });

    const result = toActionError(error, REQUEST_ID, new CapturingLogger());

    expect(result.message).toBe(
      'Tu plan permite hasta 10 usuarios. Pide al administrador ampliar el plan.',
    );
  });

  it('una reason desconocida usa el mensaje del código', () => {
    const error = new ConflictError({ reason: 'no_existe', message: SECRET });

    const result = toActionError(error, REQUEST_ID, new CapturingLogger());

    expect(result.message).toBe(messages.errors.codes.CONFLICT);
  });

  it('una reason heredada de Object.prototype no se trata como conocida', () => {
    const error = new ConflictError({ reason: 'toString' });

    expect(toActionError(error, REQUEST_ID, new CapturingLogger()).message).toBe(
      messages.errors.codes.CONFLICT,
    );
  });

  it('ValidationError incluye fieldErrors', () => {
    const fieldErrors = { 'lines.0.quantity': ['Debe ser al menos 1.'] };

    const result = toActionError(
      new ValidationError({ fieldErrors }),
      REQUEST_ID,
      new CapturingLogger(),
    );

    expect(result).toMatchObject({ code: 'VALIDATION', fieldErrors });
  });

  it('un error inesperado → INTERNAL con mensaje genérico y logger.error con err', () => {
    const logger = new CapturingLogger();
    const error = new Error(SECRET);

    const result = toActionError(error, REQUEST_ID, logger);

    expect(result).toEqual({
      code: 'INTERNAL',
      message: messages.errors.codes.INTERNAL,
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    const entry = logger.entries.find((e) => e.level === 'error');
    expect(entry?.fields.err).toBe(error);
  });

  it('un valor lanzado que no es Error también da INTERNAL', () => {
    expect(toActionError('texto', REQUEST_ID, new CapturingLogger()).code).toBe('INTERNAL');
  });

  it('los errores de dominio se registran como info, no como error', () => {
    const logger = new CapturingLogger();

    toActionError(new NotFoundError(), REQUEST_ID, logger);

    expect(logger.entries.map((e) => e.level)).toEqual(['info']);
    expect(logger.entries[0]?.fields).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('relanza redirect() de next/navigation', () => {
    const redirectError = thrown(() => redirect('/'));

    expect(() => toActionError(redirectError, REQUEST_ID, new CapturingLogger())).toThrow(
      redirectError,
    );
  });

  it('relanza notFound() de next/navigation', () => {
    const notFoundError = thrown(() => notFound());

    expect(() => toActionError(notFoundError, REQUEST_ID, new CapturingLogger())).toThrow(
      notFoundError,
    );
  });
});
