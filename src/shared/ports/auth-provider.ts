// Puerto de autenticación (ADR-002). Adaptador Supabase Auth en E1-H2; por request (sesión en cookies).
export type SignInResult =
  | { readonly ok: true; readonly authUserId: string }
  | { readonly ok: false; readonly reason: 'invalid_credentials' };

export interface AuthSession {
  readonly authUserId: string;
  readonly email: string;
}

export interface AuthProvider {
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  /** Crea la cuenta (aceptar invitación). */
  createUser(input: { email: string; password: string }): Promise<{ authUserId: string }>;
}
