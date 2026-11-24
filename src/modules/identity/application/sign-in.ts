// Iniciar sesión (E1-H2). Caso de uso previo al ctx (ADR-006): no revela si el correo existe.
import { ForbiddenError, UnauthenticatedError } from '@/shared/errors';
import type { AuthProvider } from '@/shared/ports/auth-provider';

export async function signIn(
  input: { email: string; password: string },
  deps: { auth: AuthProvider },
): Promise<Record<string, never>> {
  const result = await deps.auth.signInWithPassword(input.email, input.password);
  if (result.ok) return {};
  if (result.reason === 'rate_limited') {
    throw new ForbiddenError({ reason: 'too_many_attempts', message: 'Auth rate limited' });
  }
  throw new UnauthenticatedError({ reason: 'invalid_credentials', message: 'Invalid credentials' });
}
