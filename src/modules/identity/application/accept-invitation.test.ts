// E1-H3 · Aceptar invitación con fakes: cuenta nueva, compensación si la transacción falla y modo
// que cambió entre la vista previa y el envío.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FakeAuthProvider } from '@tests/support/fakes/fake-auth-provider';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it, vi } from 'vitest';

import { isDomainError } from '@/shared/errors';
import type { AuthAdmin } from '@/shared/ports/auth-admin';

import { generateInvitationToken } from '../domain/invitation';

import { acceptInvitation } from './accept-invitation';
import type { AcceptUnitOfWork, Account, InvitationAcceptStore } from './invitation-accept-ports';

const clock = new FixedClock();
const TENANT = '11111111-1111-4111-8111-111111111111';

function setup(options: { account?: Account | null; failInTx?: boolean } = {}) {
  const invitation = {
    id: 'inv-1',
    tenantId: TENANT,
    email: 'ana@genrent.pe',
    roles: ['requester' as const],
    expiresAt: new Date(clock.now().getTime() + 60_000),
    acceptedAt: null,
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const uow: AcceptUnitOfWork = {
    lockInvitation: () => Promise.resolve(invitation),
    lockSeats: () => Promise.resolve(),
    findAccount: () => Promise.resolve(options.account ?? null),
    createUser: vi.fn(() =>
      options.failInTx ? Promise.reject(new Error('db down')) : Promise.resolve('user-1'),
    ),
    linkAuthUser: () => Promise.resolve(),
    findMembership: () => Promise.resolve(null),
    createMembership: () => Promise.resolve('m-1'),
    reactivateMembership: () => Promise.resolve(),
    markAccepted: vi.fn(() => Promise.resolve()),
    audit,
  };
  const store: InvitationAcceptStore = {
    preview: () =>
      Promise.resolve({ invitation, tenantName: 'Genrent', account: options.account ?? null }),
    transaction: (fn) => fn(uow),
  };
  const createUser = vi.fn(() => Promise.resolve({ ok: true as const, authUserId: 'auth-new' }));
  const deleteUser = vi.fn(() => Promise.resolve());
  const authAdmin: AuthAdmin = { createUser, deleteUser };
  const auth = new FakeAuthProvider({ signIn: { ok: true, authUserId: 'auth-new' } });
  const deps = {
    store,
    authAdmin,
    auth,
    clock,
    logger: new CapturingLogger(),
    client: { ip: '203.0.113.7', userAgent: 'test' },
  };
  return { deps, uow, audit, createUser, deleteUser, auth };
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
