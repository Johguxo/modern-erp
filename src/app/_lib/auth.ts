// AuthProvider del request, sobre las cookies de Next. En Server Components las cookies son solo
// de lectura: escribir falla y se ignora (el proxy ya refrescó la sesión).
import { cookies } from 'next/headers';

import {
  createSupabaseAuthProvider,
  type CookieJar,
} from '@/shared/adapters/supabase-auth-provider';
import type { AuthProvider } from '@/shared/ports/auth-provider';

export async function requestCookieJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        // Server Component: solo lectura.
      }
    },
  };
}

export async function getAuthProvider(): Promise<AuthProvider> {
  return createSupabaseAuthProvider(await requestCookieJar());
}
