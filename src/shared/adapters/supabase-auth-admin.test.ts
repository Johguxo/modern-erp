// E1-H3 · Traducción de errores de la API admin de Supabase al crear una cuenta.
import { describe, expect, it } from 'vitest';

import { mapCreateUserError } from './supabase-auth-admin';

describe('mapCreateUserError', () => {
  it('correo ya registrado → email_exists', () => {
    expect(mapCreateUserError({ status: 422, code: 'email_exists' })).toBe('email_exists');
    expect(mapCreateUserError({ status: 422, code: 'user_already_exists' })).toBe('email_exists');
  });

  it('contraseña débil → weak_password', () => {
    expect(mapCreateUserError({ status: 422, code: 'weak_password' })).toBe('weak_password');
  });

  it('otros errores se relanzan', () => {
    expect(() => mapCreateUserError({ status: 500, code: 'unexpected_failure' })).toThrow();
  });
});
