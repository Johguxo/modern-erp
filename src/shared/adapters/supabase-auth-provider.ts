// Adaptador Supabase Auth (@supabase/ssr) del puerto AuthProvider (ADR-006). No depende de
// next/headers: recibe un CookieJar, así lo usan igual las acciones, los route handlers y el proxy.
import { createServerClient } from '@supabase/ssr';

import { getEnv } from '../../env';
import type {
  AuthProvider,
  AuthSession,
  SignInResult,
  UpdatePasswordResult,
} from '../ports/auth-provider';

export interface CookieToSet {
  readonly name: string;
  readonly value: string;
  readonly options?: Record<string, unknown>;
}

export interface CookieJar {
  getAll(): { name: string; value: string }[];
  /** Puede no hacer nada (Server Components: solo lectura; el proxy refresca la sesión). */
  setAll(cookies: CookieToSet[]): void;
}

interface AuthErrorLike {
  readonly status?: number;
  readonly code?: string;
}

/**
 * Traduce un error de Supabase Auth sin revelar si el correo existe: cualquier 4xx es
 * "credenciales inválidas"; 429 es "demasiados intentos". Los 5xx o de red se relanzan (INTERNAL).
 */
export function mapAuthError(error: AuthErrorLike): 'invalid_credentials' | 'rate_limited' {
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited';
  if (error.status !== undefined && error.status >= 400 && error.status < 500) {
    return 'invalid_credentials';
  }
  throw Object.assign(new Error('Auth provider error'), { cause: error });
}

function createClient(jar: CookieJar) {
  const env = getEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => jar.setAll(cookies),
    },
  });
}

export function createSupabaseAuthProvider(jar: CookieJar): AuthProvider {
  const client = createClient(jar);
  return {
    async signInWithPassword(email, password): Promise<SignInResult> {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, reason: mapAuthError(error) };
      return { ok: true, authUserId: data.user.id };
    },
    async signOut(scope) {
      const { error } = await client.auth.signOut({ scope });
      // Sin sesión no hay nada que cerrar: no es un error para el usuario.
      if (error && error.status !== 401 && error.status !== 403) {
        throw Object.assign(new Error('Sign out failed'), { cause: error });
      }
    },
    async getSession(): Promise<AuthSession | null> {
      // getUser() valida el token con el servidor de Auth (no confiar solo en la cookie).
      const { data, error } = await client.auth.getUser();
      if (error || !data.user.email) return null;
      return { authUserId: data.user.id, email: data.user.email };
    },
    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw Object.assign(new Error('Password reset failed'), { cause: error });
    },
    async verifyRecoveryToken(tokenHash) {
      const { error } = await client.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
      return !error;
    },
    async updatePassword(newPassword): Promise<UpdatePasswordResult> {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (!error) return { ok: true };
      if (error.code === 'same_password') return { ok: false, reason: 'same_password' };
      if (error.code === 'weak_password') return { ok: false, reason: 'weak_password' };
      throw Object.assign(new Error('Password update failed'), { cause: error });
    },
  };
}

/**
 * Para el proxy: refresca la sesión (escribe cookies nuevas en el jar) y dice si hay usuario.
 * getUser() valida con el servidor; es el patrón recomendado por @supabase/ssr para middleware.
 */
export async function refreshAuthSession(jar: CookieJar): Promise<{ hasSession: boolean }> {
  const { data, error } = await createClient(jar).auth.getUser();
  return { hasSession: !error && Boolean(data.user) };
}
