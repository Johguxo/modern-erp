// Puerto de administración de cuentas de Auth (E1-H3, ADR-006 §9): crear la cuenta al aceptar una
// invitación y borrarla como compensación si la transacción falla. Usa el service role: el
// adaptador (src/shared/adapters/supabase-auth-admin.ts) solo corre en el servidor.
export type CreateAuthUserResult =
  | { readonly ok: true; readonly authUserId: string }
  | { readonly ok: false; readonly reason: 'email_exists' | 'weak_password' };

export interface AuthAdmin {
  /** Crea la cuenta con el correo ya confirmado (el enlace de la invitación lo prueba). */
  createUser(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<CreateAuthUserResult>;
  deleteUser(authUserId: string): Promise<void>;
}
