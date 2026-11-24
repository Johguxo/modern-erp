// E1-H2 · Adaptador Supabase Auth: traducción de errores sin revelar si el correo existe, y el
// comportamiento de cada método sobre un cliente de @supabase/ssr falso.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
};
const createServerClient = vi.fn<(...args: unknown[]) => { auth: typeof authMock }>(() => ({
  auth: authMock,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

const { mapAuthError, createSupabaseAuthProvider, refreshAuthSession } =
  await import('./supabase-auth-provider');
type CookieJar = Parameters<typeof createSupabaseAuthProvider>[0];

const jar: CookieJar = { getAll: () => [], setAll: () => undefined };

beforeEach(() => {
  for (const fn of Object.values(authMock)) fn.mockReset();
  createServerClient.mockClear();
});

describe('mapAuthError', () => {
  it.each([
    [400, 'invalid_credentials'],
    [400, 'email_not_confirmed'],
    [401, undefined],
    [422, 'user_not_found'],
    [404, 'user_banned'],
  ])(
    'mensajes en español sin revelar si el correo existe: %i (%s) → invalid_credentials',
    (status, code) => {
      expect(mapAuthError({ status, code })).toBe('invalid_credentials');
    },
  );

  it('429 → rate_limited', () => {
    expect(mapAuthError({ status: 429 })).toBe('rate_limited');
  });

  it('code over_request_rate_limit → rate_limited aunque el status sea 400', () => {
    expect(mapAuthError({ status: 400, code: 'over_request_rate_limit' })).toBe('rate_limited');
  });

  it.each([
    ['500', { status: 500 }],
    ['503', { status: 503, code: 'unexpected_failure' }],
    ['sin status (error de red)', {}],
    ['status 399', { status: 399 }],
  ])('%s → lanza (INTERNAL) con el error original en cause', (_label, error) => {
    let thrown: unknown;
    try {
      mapAuthError(error);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(error);
  });
});

describe('createSupabaseAuthProvider', () => {
  it('usa la URL y la anon key del entorno y delega las cookies al jar', () => {
    const setAll = vi.fn();
    const getAll = vi.fn(() => [{ name: 'sb', value: '1' }]);
    createSupabaseAuthProvider({ getAll, setAll });

    const [url, key, options] = createServerClient.mock.calls[0] as [
      string,
      string,
      { cookies: CookieJar },
    ];
    expect(url).toBe('http://127.0.0.1:54321');
    expect(key).toBe('test-anon-key');
    expect(options.cookies.getAll()).toEqual([{ name: 'sb', value: '1' }]);
    options.cookies.setAll([{ name: 'x', value: 'y' }]);
    expect(setAll).toHaveBeenCalledWith([{ name: 'x', value: 'y' }]);
  });

  it('iniciar sesión correcto devuelve el id de Auth', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-1' } },
      error: null,
    });

    const result = await createSupabaseAuthProvider(jar).signInWithPassword('a@b.pe', 'secret');

    expect(result).toEqual({ ok: true, authUserId: 'auth-1' });
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.pe',
      password: 'secret',
    });
  });

  it('contraseña errónea → invalid_credentials (mismo resultado que un correo inexistente)', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: 'invalid_credentials' },
    });

    const result = await createSupabaseAuthProvider(jar).signInWithPassword('a@b.pe', 'x');

    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('un 5xx al iniciar sesión se relanza', async () => {
    authMock.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { status: 500 } });

    await expect(createSupabaseAuthProvider(jar).signInWithPassword('a@b.pe', 'x')).rejects.toThrow(
      'Auth provider error',
    );
  });

  it.each(['local', 'others'] as const)('signOut(%s) pasa el scope', async (scope) => {
    authMock.signOut.mockResolvedValue({ error: null });

    await createSupabaseAuthProvider(jar).signOut(scope);

    expect(authMock.signOut).toHaveBeenCalledWith({ scope });
  });

  it.each([401, 403])('cerrar sesión sin sesión (%i) no es un error', async (status) => {
    authMock.signOut.mockResolvedValue({ error: { status } });

    await expect(createSupabaseAuthProvider(jar).signOut('local')).resolves.toBeUndefined();
  });

  it('cerrar sesión con un 500 lanza', async () => {
    authMock.signOut.mockResolvedValue({ error: { status: 500 } });

    await expect(createSupabaseAuthProvider(jar).signOut('local')).rejects.toThrow(
      'Sign out failed',
    );
  });

  it('getSession valida con getUser() y devuelve id y correo', async () => {
    authMock.getUser.mockResolvedValue({
      data: { user: { id: 'auth-1', email: 'a@b.pe' } },
      error: null,
    });

    expect(await createSupabaseAuthProvider(jar).getSession()).toEqual({
      authUserId: 'auth-1',
      email: 'a@b.pe',
    });
  });

  it('getSession con error (token inválido o vencido) → null', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });

    expect(await createSupabaseAuthProvider(jar).getSession()).toBeNull();
  });

  it('getSession de un usuario sin correo → null', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });

    expect(await createSupabaseAuthProvider(jar).getSession()).toBeNull();
  });

  it('sendPasswordReset lanza si el proveedor falla (el caso de uso lo absorbe)', async () => {
    authMock.resetPasswordForEmail.mockResolvedValue({ error: { status: 500 } });

    await expect(createSupabaseAuthProvider(jar).sendPasswordReset('a@b.pe')).rejects.toThrow(
      'Password reset failed',
    );
  });

  it('verifyRecoveryToken usa type recovery con token_hash y devuelve true/false', async () => {
    const provider = createSupabaseAuthProvider(jar);
    authMock.verifyOtp.mockResolvedValueOnce({ error: null });
    authMock.verifyOtp.mockResolvedValueOnce({ error: { status: 403, code: 'otp_expired' } });

    expect(await provider.verifyRecoveryToken('hash-1')).toBe(true);
    expect(await provider.verifyRecoveryToken('hash-2')).toBe(false);
    expect(authMock.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'hash-1' });
  });

  it.each([
    [null, { ok: true }],
    [
      { status: 422, code: 'same_password' },
      { ok: false, reason: 'same_password' },
    ],
    [
      { status: 422, code: 'weak_password' },
      { ok: false, reason: 'weak_password' },
    ],
  ])('updatePassword con error %j → %j', async (error, expected) => {
    authMock.updateUser.mockResolvedValue({ error });

    expect(await createSupabaseAuthProvider(jar).updatePassword('nueva-clave-1234')).toEqual(
      expected,
    );
  });

  it('updatePassword con otro error lanza', async () => {
    authMock.updateUser.mockResolvedValue({ error: { status: 500 } });

    await expect(createSupabaseAuthProvider(jar).updatePassword('x')).rejects.toThrow(
      'Password update failed',
    );
  });
});

describe('refreshAuthSession', () => {
  it('con usuario → hasSession true', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });

    expect(await refreshAuthSession(jar)).toEqual({ hasSession: true });
  });

  it('con error → hasSession false', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });

    expect(await refreshAuthSession(jar)).toEqual({ hasSession: false });
  });
});
