// E0-H3 · Ayudas para traducir errores de Postgres en los repositorios (decisión 11 del plan).
import { describe, expect, it } from 'vitest';

import { isUniqueViolation, pgErrorCode, PG_UNIQUE_VIOLATION } from './errors';

/** Forma de un error de postgres-js. */
function pgError(code: string, constraint?: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    constraint_name: constraint,
  });
}

/** Drizzle envuelve el error del driver en `cause`. */
function drizzleWrapped(cause: unknown) {
  return Object.assign(new Error('Failed query: insert ... params: secret'), {
    query: 'insert ...',
    cause,
  });
}

describe('pgErrorCode', () => {
  it('lee el SQLSTATE del error del driver', () => {
    expect(pgErrorCode(pgError('23505'))).toBe('23505');
  });

  it('desenvuelve cause (error de Drizzle)', () => {
    expect(pgErrorCode(drizzleWrapped(pgError('42501')))).toBe('42501');
    expect(pgErrorCode(drizzleWrapped(drizzleWrapped(pgError('23503'))))).toBe('23503');
  });

  it('sin SQLSTATE devuelve undefined', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode('23505')).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  it('true para 23505 sin pedir constraint', () => {
    expect(PG_UNIQUE_VIOLATION).toBe('23505');
    expect(isUniqueViolation(drizzleWrapped(pgError('23505', 'x_key')))).toBe(true);
  });

  it('con constraint: true solo si coincide constraint_name', () => {
    const error = drizzleWrapped(pgError('23505', 'products_tenant_code_key'));

    expect(isUniqueViolation(error, 'products_tenant_code_key')).toBe(true);
    expect(isUniqueViolation(error, 'otro_key')).toBe(false);
  });

  it('acepta también la propiedad constraint', () => {
    const error = Object.assign(new Error('dup'), { code: '23505', constraint: 'a_key' });

    expect(isUniqueViolation(error, 'a_key')).toBe(true);
  });

  it('false para otro SQLSTATE o un error que no es de Postgres', () => {
    expect(isUniqueViolation(pgError('23503', 'x_key'), 'x_key')).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
  });
});
