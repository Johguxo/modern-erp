// Restablecer la contraseña con el token del correo (E1-H2, ADR-006): canjea el token, cambia la
// contraseña y cierra las demás sesiones. El token es de un solo uso: si el proveedor rechaza la
// contraseña, el enlace ya quedó gastado, así que se cierra la sesión de recuperación y se pide un
// enlace nuevo (el formulario valida el largo antes de enviar, así que es raro).
import { ValidationError } from '@/shared/errors';
import type { AuthProvider } from '@/shared/ports/auth-provider';
import type { Logger } from '@/shared/ports/logger';

export async function resetPassword(
  input: { tokenHash: string; password: string },
  deps: { auth: AuthProvider; logger: Logger },
): Promise<Record<string, never>> {
  if (!(await deps.auth.verifyRecoveryToken(input.tokenHash))) {
    throw new ValidationError({ reason: 'reset_link_invalid', message: 'Invalid recovery token' });
  }
  const result = await deps.auth.updatePassword(input.password);
  if (!result.ok) {
    try {
      await deps.auth.signOut('local');
    } catch (error) {
      deps.logger.warn({ err: error }, 'sign out of recovery session failed');
    }
    throw new ValidationError({
      reason: result.reason === 'same_password' ? 'same_password' : 'weak_password',
      message: `Password rejected: ${result.reason}`,
    });
  }
  try {
    await deps.auth.signOut('others');
  } catch (error) {
    // La contraseña ya cambió: no se le muestra un error al usuario por esto.
    deps.logger.warn({ err: error }, 'sign out of other sessions failed');
  }
  return {};
}
