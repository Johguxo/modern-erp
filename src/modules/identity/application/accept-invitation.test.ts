// E1-H3 · Aceptar invitación con fakes: cuenta nueva, compensación si la transacción falla y modo
// que cambió entre la vista previa y el envío.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FakeAuthProvider } from '@tests/support/fakes/fake-auth-provider';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it, vi } from 'vitest';

import { isDomainError } from '@/shared/errors';
import type { AuthAdmin, CreateAuthUserResult } from '@/shared/ports/auth-admin';
import type { AuthSession, SignInResult } from '@/shared/ports/auth-provider';

import { generateInvitationToken } from '../domain/invitation';

import { acceptInvitation } from './accept-invitation';
import type {
  AcceptableInvitation,
  AcceptUnitOfWork,
  Account,
  InvitationAcceptStore,
} from './invitation-accept-ports';
import { previewInvitation } from './preview-invitation';

const clock = new FixedClock();
const TENANT = '11111111-1111-4111-8111-111111111111';

interface SetupOptions {
  account?: Account | null;
  failInTx?: boolean;
  /** La invitación no existe (token desconocido). */
  missing?: boolean;
  invitation?: Partial<AcceptableInvitation>;
  /** Estado de la invitación al bloquearla en la transacción (otra aceptación ganó). */
  lockedInvitation?: AcceptableInvitation | null;
  session?: AuthSession | null;
  createUserResult?: CreateAuthUserResult;
  signIn?: SignInResult;
  /** La empresa está en solo lectura al aceptar. */
  readOnly?: boolean;
}

function setup(options: SetupOptions = {}) {
  const invitation: AcceptableInvitation = {
    id: 'inv-1',
    tenantId: TENANT,
    email: 'ana@genrent.pe',
    roles: ['requester' as const],
    expiresAt: new Date(clock.now().getTime() + 60_000),
    acceptedAt: null,
    ...options.invitation,
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const markAccepted = vi.fn(() => Promise.resolve());
  const lockOrder: string[] = [];
  const uow: AcceptUnitOfWork = {
    lockInvitation: () => {
      lockOrder.push('invitation');
      return Promise.resolve(
        options.lockedInvitation !== undefined ? options.lockedInvitation : invitation,
      );
    },
    lockSeats: (tenantId) => {
      lockOrder.push(`seats:${tenantId}`);
      return Promise.resolve();
    },
    loadAccessStatus: () =>
      Promise.resolve(
        options.readOnly
          ? { tenantStatus: 'suspended' as const, subscription: { status: 'active' as const } }
          : { tenantStatus: 'active' as const, subscription: { status: 'active' as const } },
      ),
    findAccount: () => Promise.resolve(options.account ?? null),
    createUser: vi.fn(() =>
      options.failInTx ? Promise.reject(new Error('db down')) : Promise.resolve('user-1'),
    ),
    linkAuthUser: () => Promise.resolve(),
    findMembership: () => Promise.resolve(null),
    createMembership: () => Promise.resolve('m-1'),
    reactivateMembership: () => Promise.resolve(),
    markAccepted,
    audit,
  };
  const store: InvitationAcceptStore = {
    preview: () =>
      Promise.resolve(
        options.missing
          ? null
          : { invitation, tenantName: 'Genrent', account: options.account ?? null },
      ),
    transaction: (fn) => fn(uow),
  };
  const createUser = vi.fn((): Promise<CreateAuthUserResult> =>
    Promise.resolve(options.createUserResult ?? { ok: true, authUserId: 'auth-new' }),
  );
  const deleteUser = vi.fn(() => Promise.resolve());
  const authAdmin: AuthAdmin = { createUser, deleteUser };
  const auth = new FakeAuthProvider({
    signIn: options.signIn ?? { ok: true, authUserId: 'auth-new' },
    session: options.session ?? null,
  });
  const deps = {
    store,
    authAdmin,
    auth,
    clock,
    logger: new CapturingLogger(),
    client: { ip: '203.0.113.7', userAgent: 'test' },
  };
  return { deps, uow, audit, createUser, deleteUser, auth, markAccepted, lockOrder };
}

const token = generateInvitationToken();

describe('acceptInvitation', () => {
  it('cuenta nueva: crea la cuenta en Auth, la membresía, audita con el invitado e inicia sesión', async () => {
    const { deps, audit, createUser, auth } = setup();

    const result = await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    );

    expect(result).toEqual({ tenantId: TENANT, authUserId: 'auth-new' });
    expect(createUser).toHaveBeenCalledWith({
      email: 'ana@genrent.pe',
      password: 'clave-segura-1',
      fullName: 'Ana',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', action: 'invitation.accepted' }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(token);
    expect(auth.methods()).toContain('signInWithPassword');
  });

  it('si la transacción falla después de crear la cuenta, se borra la cuenta de Auth', async () => {
    const { deps, deleteUser } = setup({ failInTx: true });

    await expect(
      acceptInvitation(
        { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
        deps,
      ),
    ).rejects.toThrow('db down');
    expect(deleteUser).toHaveBeenCalledWith('auth-new');
  });

  it('cuenta existente pero el formulario era de cuenta nueva → CONFLICT, sin crear nada', async () => {
    const { deps, createUser } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
    });

    const error = await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    ).catch((e: unknown) => e);

    expect(isDomainError(error) && error.code).toBe('CONFLICT');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('toma el bloqueo de cupos (tenant de la vista previa) antes que la fila de la invitación', async () => {
    const { deps, lockOrder } = setup();

    await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    );

    expect(lockOrder).toEqual([`seats:${TENANT}`, 'invitation']);
  });

  it('empresa en solo lectura → FORBIDDEN tenant_read_only, sin marcar y borrando la cuenta creada', async () => {
    const { deps, markAccepted, deleteUser } = setup({ readOnly: true });

    const error = await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'FORBIDDEN', reason: 'tenant_read_only' });
    expect(markAccepted).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('auth-new');
  });

  it('cuenta desactivada → account_disabled', async () => {
    const { deps } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'disabled' },
    });

    const error = await acceptInvitation({ mode: 'password', token, password: 'x' }, deps).catch(
      (e: unknown) => e,
    );

    expect(isDomainError(error) && error.reason).toBe('account_disabled');
  });
});

describe('acceptInvitation · invitación inválida, vencida o aceptada', () => {
  const newAccount = {
    mode: 'new_account' as const,
    token,
    fullName: 'Ana',
    password: 'clave-segura-1',
  };

  it.each([
    ['inexistente', { missing: true }],
    ['vencida', { invitation: { expiresAt: new Date(clock.now().getTime() - 1) } }],
    ['ya aceptada', { invitation: { acceptedAt: clock.now() } }],
  ] satisfies [string, SetupOptions][])(
    '%s → el mismo VALIDATION invitation_invalid, sin crear la cuenta',
    async (_label, options) => {
      const { deps, createUser } = setup(options);

      const error = await acceptInvitation(newAccount, deps).catch((e: unknown) => e);

      expect(isDomainError(error) && [error.code, error.reason]).toEqual([
        'VALIDATION',
        'invitation_invalid',
      ]);
      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it('otra aceptación ganó entre la vista previa y la transacción → invitation_invalid y se borra la cuenta creada', async () => {
    const { deps, deleteUser, markAccepted } = setup({
      lockedInvitation: {
        id: 'inv-1',
        tenantId: TENANT,
        email: 'ana@genrent.pe',
        roles: ['requester'],
        expiresAt: new Date(clock.now().getTime() + 60_000),
        acceptedAt: clock.now(),
      },
    });

    const error = await acceptInvitation(newAccount, deps).catch((e: unknown) => e);

    expect(isDomainError(error) && error.reason).toBe('invitation_invalid');
    expect(deleteUser).toHaveBeenCalledWith('auth-new');
    expect(markAccepted).not.toHaveBeenCalled();
  });
});

describe('acceptInvitation · cuentas y sesiones', () => {
  it('Auth rechaza la contraseña al crear la cuenta → VALIDATION password_rejected en el campo password', async () => {
    const { deps, deleteUser } = setup({
      createUserResult: { ok: false, reason: 'weak_password' },
    });

    const error = await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'VALIDATION',
      reason: 'password_rejected',
      fieldErrors: { password: ['password_rejected'] },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('Auth ya tiene el correo (carrera) → CONFLICT email_in_use', async () => {
    const { deps } = setup({ createUserResult: { ok: false, reason: 'email_exists' } });

    const error = await acceptInvitation(
      { mode: 'new_account', token, fullName: 'Ana', password: 'clave-segura-1' },
      deps,
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'CONFLICT', reason: 'email_in_use' });
  });

  it('cuenta existente: inicia sesión con el correo de la invitación y solo agrega la membresía', async () => {
    const { deps, createUser, auth, audit } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
      signIn: { ok: true, authUserId: 'auth-9' },
    });

    const result = await acceptInvitation({ mode: 'password', token, password: 'su-clave' }, deps);

    expect(result).toEqual({ tenantId: TENANT, authUserId: 'auth-9' });
    expect(createUser).not.toHaveBeenCalled();
    expect(auth.calls).toContainEqual({
      method: 'signInWithPassword',
      email: 'ana@genrent.pe',
      password: 'su-clave',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-9', tenantId: TENANT }),
    );
  });

  it('cuenta existente con contraseña errónea → invalid_credentials, sin membresía', async () => {
    const { deps, markAccepted } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
      signIn: { ok: false, reason: 'invalid_credentials' },
    });

    const error = await acceptInvitation({ mode: 'password', token, password: 'mala' }, deps).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ code: 'UNAUTHENTICATED', reason: 'invalid_credentials' });
    expect(markAccepted).not.toHaveBeenCalled();
  });

  it('sesión con el mismo correo → se une sin pedir contraseña', async () => {
    const { deps, auth, createUser } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
      session: { authUserId: 'auth-9', email: 'ANA@genrent.pe' },
    });

    const result = await acceptInvitation({ mode: 'session', token }, deps);

    expect(result.authUserId).toBe('auth-9');
    expect(auth.methods()).not.toContain('signInWithPassword');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('sesión de otro correo: no se usa esa sesión; "session" → CONFLICT y no se une con la cuenta ajena', async () => {
    const { deps, markAccepted } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
      session: { authUserId: 'auth-intruso', email: 'otro@genrent.pe' },
    });

    const error = await acceptInvitation({ mode: 'session', token }, deps).catch((e: unknown) => e);

    expect(isDomainError(error) && error.code).toBe('CONFLICT');
    expect(markAccepted).not.toHaveBeenCalled();
  });

  it('sesión de otro correo con cuenta existente: inicia sesión con el correo de la invitación, no con el de la sesión', async () => {
    const { deps, auth } = setup({
      account: { userId: 'user-9', authUserId: 'auth-9', status: 'active' },
      session: { authUserId: 'auth-intruso', email: 'otro@genrent.pe' },
      signIn: { ok: true, authUserId: 'auth-9' },
    });

    const result = await acceptInvitation({ mode: 'password', token, password: 'su-clave' }, deps);

    expect(result.authUserId).toBe('auth-9');
    expect(auth.calls).toContainEqual(
      expect.objectContaining({ method: 'signInWithPassword', email: 'ana@genrent.pe' }),
    );
  });
});

describe('previewInvitation', () => {
  it('token con formato inválido → invalid sin consultar la base', async () => {
    const { deps } = setup();
    const preview = vi.spyOn(deps.store, 'preview');

    expect(await previewInvitation({ token: 'corto' }, deps)).toEqual({ kind: 'invalid' });
    expect(preview).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente', { missing: true }],
    ['vencida', { invitation: { expiresAt: new Date(clock.now().getTime() - 1) } }],
    ['ya aceptada', { invitation: { acceptedAt: clock.now() } }],
  ] satisfies [string, SetupOptions][])('%s → invalid (mismo resultado)', async (_l, options) => {
    const { deps } = setup(options);
    expect(await previewInvitation({ token }, deps)).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['sin cuenta → new_account', {}, 'new_account'],
    [
      'con cuenta → password',
      { account: { userId: 'u', authUserId: 'a', status: 'active' } },
      'password',
    ],
    [
      'usuario sin auth_user_id → new_account',
      { account: { userId: 'u', authUserId: null, status: 'active' } },
      'new_account',
    ],
    [
      'sesión del mismo correo → session',
      { session: { authUserId: 'a', email: 'ana@genrent.pe' } },
      'session',
    ],
    [
      'sesión de otro correo → como sin sesión',
      { session: { authUserId: 'x', email: 'otro@genrent.pe' } },
      'new_account',
    ],
  ] satisfies [string, SetupOptions, string][])('%s', async (_l, options, mode) => {
    const { deps } = setup(options);
    expect(await previewInvitation({ token }, deps)).toEqual({
      kind: 'valid',
      email: 'ana@genrent.pe',
      tenantName: 'Genrent',
      mode,
    });
  });
});
