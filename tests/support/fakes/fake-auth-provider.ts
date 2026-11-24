// AuthProvider en memoria: respuestas configurables y registro de llamadas (E1-H2).
import type {
  AuthProvider,
  AuthSession,
  SignInResult,
  UpdatePasswordResult,
} from '@/shared/ports/auth-provider';

export interface FakeAuthOptions {
  signIn?: SignInResult;
  session?: AuthSession | null;
  /** Si se da, sendPasswordReset lanza este error. */
  resetError?: Error;
  recoveryTokenValid?: boolean;
  updatePassword?: UpdatePasswordResult;
}

export type FakeAuthCall =
  | { method: 'signInWithPassword'; email: string; password: string }
  | { method: 'signOut'; scope: 'local' | 'others' }
  | { method: 'getSession' }
  | { method: 'sendPasswordReset'; email: string }
  | { method: 'verifyRecoveryToken'; tokenHash: string }
  | { method: 'updatePassword'; newPassword: string };

export class FakeAuthProvider implements AuthProvider {
  readonly calls: FakeAuthCall[] = [];

  constructor(private readonly options: FakeAuthOptions = {}) {}

  signInWithPassword(email: string, password: string): Promise<SignInResult> {
    this.calls.push({ method: 'signInWithPassword', email, password });
    return Promise.resolve(this.options.signIn ?? { ok: true, authUserId: 'auth-user-1' });
  }

  signOut(scope: 'local' | 'others'): Promise<void> {
    this.calls.push({ method: 'signOut', scope });
    return Promise.resolve();
  }

  getSession(): Promise<AuthSession | null> {
    this.calls.push({ method: 'getSession' });
    return Promise.resolve(this.options.session ?? null);
  }

  sendPasswordReset(email: string): Promise<void> {
    this.calls.push({ method: 'sendPasswordReset', email });
    if (this.options.resetError !== undefined) {
      return Promise.reject(this.options.resetError);
    }
    return Promise.resolve();
  }

  verifyRecoveryToken(tokenHash: string): Promise<boolean> {
    this.calls.push({ method: 'verifyRecoveryToken', tokenHash });
    return Promise.resolve(this.options.recoveryTokenValid ?? true);
  }

  updatePassword(newPassword: string): Promise<UpdatePasswordResult> {
    this.calls.push({ method: 'updatePassword', newPassword });
    return Promise.resolve(this.options.updatePassword ?? { ok: true });
  }

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }
}
