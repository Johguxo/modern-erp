// Puerto de autenticación (ADR-002, ADR-006). Adaptador: src/shared/adapters/supabase-auth-provider.ts.
// Es por request: la sesión vive en cookies. Crear cuentas (service role) es otro puerto: AuthAdmin
// (E1-H3).
export type SignInResult =
  | { readonly ok: true; readonly authUserId: string }
  | { readonly ok: false; readonly reason: 'invalid_credentials' | 'rate_limited' };

export type UpdatePasswordResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'weak_password' | 'same_password' };

export interface AuthSession {
  readonly authUserId: string;
  readonly email: string;
}

export interface AuthProvider {
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  /** local: esta sesión; others: todas las demás (tras cambiar la contraseña). */
  signOut(scope: 'local' | 'others'): Promise<void>;
  /** Sesión validada contra el servidor de Auth (no solo la cookie). */
  getSession(): Promise<AuthSession | null>;
  /** Envía el correo de recuperación (el enlace lo arma la plantilla del proveedor). */
  sendPasswordReset(email: string): Promise<void>;
  /** Canjea el token del correo de recuperación por una sesión. false si es inválido o venció. */
  verifyRecoveryToken(tokenHash: string): Promise<boolean>;
  updatePassword(newPassword: string): Promise<UpdatePasswordResult>;
}
