// Adaptador del puerto AuthAdmin con la API admin de Supabase (service role). Solo servidor: la
// clave nunca sale de aquí (ADR-006 §9, E1-H3). Sin sesión persistente ni refresco: cada llamada
// es una petición administrativa suelta.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getEnv } from '../../env';
import type { AuthAdmin, CreateAuthUserResult } from '../ports/auth-admin';

interface AuthErrorLike {
  readonly status?: number;
  readonly code?: string;
}

/** Traduce el error de createUser: correo ya registrado o contraseña rechazada; el resto se relanza. */
export function mapCreateUserError(error: AuthErrorLike): 'email_exists' | 'weak_password' {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return 'email_exists';
  if (error.code === 'weak_password') return 'weak_password';
  throw Object.assign(new Error('Auth admin createUser failed'), { cause: error });
}

let cached: SupabaseClient | undefined;

function client(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('AuthAdmin solo se usa en el servidor.');
  const env = getEnv();
  cached ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return cached;
}

export function createSupabaseAuthAdmin(): AuthAdmin {
  return {
    async createUser({ email, password, fullName }): Promise<CreateAuthUserResult> {
      const { data, error } = await client().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) return { ok: false, reason: mapCreateUserError(error) };
      return { ok: true, authUserId: data.user.id };
    },
    async deleteUser(authUserId) {
      const { error } = await client().auth.admin.deleteUser(authUserId);
      if (error && error.status !== 404) {
        throw Object.assign(new Error('Auth admin deleteUser failed'), { cause: error });
      }
    },
  };
}
