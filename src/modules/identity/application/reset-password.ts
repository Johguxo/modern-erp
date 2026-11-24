// Restablecer la contraseña con el token del correo (E1-H2, ADR-006): canjea el token, cambia la
// contraseña y cierra las demás sesiones.
import { ValidationError } from '@/shared/errors';
import type { AuthProvider } from '@/shared/ports/auth-provider';

export async function resetPassword(
  input: { tokenHash: string; password: string },
  deps: { auth: AuthProvider },
): Promise<Record<string, never>> {
  if (!(await deps.auth.verifyRecoveryToken(input.tokenHash))) {
    throw new ValidationError({ reason: 'reset_link_invalid', message: 'Invalid recovery token' });
  }
  const result = await deps.auth.updatePassword(input.password);
  if (!result.ok) {
    throw new ValidationError({
      reason: result.reason === 'same_password' ? 'same_password' : 'weak_password',
      fieldErrors: { password: [result.reason] },
      message: `Password rejected: ${result.reason}`,
    });
  }
  await deps.auth.signOut('others');
  return {};
}
