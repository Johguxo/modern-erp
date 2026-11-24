// Pedir el correo de recuperación (E1-H2). Siempre responde igual, exista o no el correo: los
// errores del proveedor solo van al log.
import type { AuthProvider } from '@/shared/ports/auth-provider';
import type { Logger } from '@/shared/ports/logger';

export async function requestPasswordReset(
  input: { email: string },
  deps: { auth: AuthProvider; logger: Logger },
): Promise<Record<string, never>> {
  try {
    await deps.auth.sendPasswordReset(input.email);
  } catch (error) {
    deps.logger.warn({ err: error }, 'password reset email failed');
  }
  return {};
}
