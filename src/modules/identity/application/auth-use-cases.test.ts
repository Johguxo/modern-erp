// E1-H2 · Casos de uso previos al ctx (iniciar sesión, recuperar y restablecer contraseña) con un
// AuthProvider falso. Los mensajes nunca revelan si el correo existe.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FakeAuthProvider } from '@tests/support/fakes/fake-auth-provider';
import { describe, expect, it } from 'vitest';

import { ForbiddenError, UnauthenticatedError, ValidationError } from '@/shared/errors';

import { requestPasswordReset } from './request-password-reset';
import { resetPassword } from './reset-password';
import { signIn } from './sign-in';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error');
}

describe('signIn', () => {
  it('iniciar sesión correcto → {} y pasa correo y contraseña al proveedor', async () => {
    const auth = new FakeAuthProvider({ signIn: { ok: true, authUserId: 'auth-1' } });

    expect(await signIn({ email: 'ana@genrent.pe', password: 'secreto' }, { auth })).toEqual({});
    expect(auth.calls).toEqual([
      { method: 'signInWithPassword', email: 'ana@genrent.pe', password: 'secreto' },
    ]);
  });

  it('contraseña errónea o correo inexistente → UnauthenticatedError invalid_credentials', async () => {
    const auth = new FakeAuthProvider({ signIn: { ok: false, reason: 'invalid_credentials' } });

    const error = await caught(signIn({ email: 'x@y.pe', password: 'mala' }, { auth }));

    expect(error).toBeInstanceOf(UnauthenticatedError);
    expect((error as UnauthenticatedError).reason).toBe('invalid_credentials');
  });

  it('demasiados intentos → ForbiddenError too_many_attempts', async () => {
    const auth = new FakeAuthProvider({ signIn: { ok: false, reason: 'rate_limited' } });

    const error = await caught(signIn({ email: 'x@y.pe', password: 'mala' }, { auth }));

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).reason).toBe('too_many_attempts');
  });
});

describe('requestPasswordReset', () => {
  it('envía el correo y responde {}', async () => {
    const auth = new FakeAuthProvider();
    const logger = new CapturingLogger();

    expect(await requestPasswordReset({ email: 'ana@genrent.pe' }, { auth, logger })).toEqual({});
    expect(auth.calls).toEqual([{ method: 'sendPasswordReset', email: 'ana@genrent.pe' }]);
    expect(logger.entries).toEqual([]);
  });

  it('responde {} aunque el proveedor falle (no revela si el correo existe) y registra un warn', async () => {
    const boom = new Error('user not found');
    const auth = new FakeAuthProvider({ resetError: boom });
    const logger = new CapturingLogger();

    expect(await requestPasswordReset({ email: 'nadie@x.pe' }, { auth, logger })).toEqual({});
    const entry = logger.find('password reset email failed');
    expect(entry?.level).toBe('warn');
    expect(entry?.fields.err).toBe(boom);
  });
});

describe('resetPassword', () => {
  const input = { tokenHash: 'hash-1', password: 'nueva-clave-123' };

  it('token inválido o vencido → ValidationError reset_link_invalid sin llamar a updatePassword', async () => {
    const auth = new FakeAuthProvider({ recoveryTokenValid: false });

    const error = await caught(resetPassword(input, { auth }));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).reason).toBe('reset_link_invalid');
    expect(auth.methods()).toEqual(['verifyRecoveryToken']);
  });

  it.each(['weak_password', 'same_password'] as const)(
    'contraseña rechazada (%s) → ValidationError con reason y fieldErrors.password; no cierra otras sesiones',
    async (reason) => {
      const auth = new FakeAuthProvider({ updatePassword: { ok: false, reason } });

      const error = await caught(resetPassword(input, { auth }));

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).reason).toBe(reason);
      expect((error as ValidationError).fieldErrors.password).toHaveLength(1);
      expect(auth.methods()).not.toContain('signOut');
    },
  );

  it('restablecer correcto: canjea el token, cambia la contraseña y cierra las demás sesiones', async () => {
    const auth = new FakeAuthProvider();

    expect(await resetPassword(input, { auth })).toEqual({});
    expect(auth.calls).toEqual([
      { method: 'verifyRecoveryToken', tokenHash: 'hash-1' },
      { method: 'updatePassword', newPassword: 'nueva-clave-123' },
      { method: 'signOut', scope: 'others' },
    ]);
  });
});
