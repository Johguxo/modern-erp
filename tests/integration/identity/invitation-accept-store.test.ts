// E1-H3 · Aceptar invitación con el store real (conexión dueño, acotado por token_hash): crea el
// usuario y la membresía, reactiva una membresía desactivada, marca accepted_at, audita con el
// invitado como actor, rechaza una segunda aceptación y respeta users.status = disabled.
// Auth se reemplaza por fakes (no hay FK a auth.users).
import { randomUUID } from 'node:crypto';

import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FakeAuthProvider } from '@tests/support/fakes/fake-auth-provider';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, invitations, memberships, users } from '@/db/schema';
import { acceptInvitation, createInvitationServices } from '@/modules/identity';
import { generateInvitationToken, hashInvitationToken } from '@/modules/identity/domain/invitation';
import { isDomainError } from '@/shared/errors';
import type { AuthAdmin } from '@/shared/ports/auth-admin';
import type { AuthSession } from '@/shared/ports/auth-provider';

import { createIdentityFixtures, randomEmail } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const clock = new FixedClock(new Date('2990-01-01T00:00:00.000Z'));
const CLIENT = { ip: '198.51.100.40', userAgent: 'vitest-accept' };

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

function deps(options: { signInAs?: string; session?: AuthSession } = {}) {
  const createdAuthId = randomUUID();
  const createUser = vi.fn(() => Promise.resolve({ ok: true as const, authUserId: createdAuthId }));
  const deleteUser = vi.fn(() => Promise.resolve());
  const authAdmin: AuthAdmin = { createUser, deleteUser };
  return {
    createdAuthId,
    createUser,
    deleteUser,
    deps: {
      store: createInvitationServices(getDbAdmin()).store,
      authAdmin,
      auth: new FakeAuthProvider({
        signIn: { ok: true, authUserId: options.signInAs ?? createdAuthId },
        session: options.session ?? null,
      }),
      clock,
      logger: new CapturingLogger(),
      client: CLIENT,
    },
  };
}

async function tenantWithInvitation(opts: { email?: string; roles?: string[] } = {}) {
  const tenant = await fx.tenant();
  await fx.subscription(tenant.id, 'starter');
  const inviter = await fx.user();
  await fx.membership(tenant.id, inviter.id, { roles: ['admin'] });
  const token = generateInvitationToken();
  const email = opts.email ?? randomEmail();
  fx.trackUserEmail(email);
  const invitation = await fx.invitation(tenant.id, {
    email,
    roles: opts.roles ?? ['approver'],
    tokenHash: hashInvitationToken(token),
    invitedBy: inviter.id,
  });
  return { tenantId: tenant.id, token, email, invitationId: invitation.id };
}

async function membershipOf(tenantId: string, email: string) {
  const [row] = await getDbAdmin()
    .select({ id: memberships.id, roles: memberships.roles, status: memberships.status })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(users.email, email)));
  return row;
}

describe('aceptar invitación con el store de admin', () => {
  it('cuenta nueva: crea users (con auth_user_id) y la membresía con los roles, marca accepted_at y audita con el invitado', async () => {
    const inv = await tenantWithInvitation();
    const { deps: d, createdAuthId } = deps();

    const result = await acceptInvitation(
      { mode: 'new_account', token: inv.token, fullName: 'Ana Nueva', password: 'clave-segura-1' },
      d,
    );

    expect(result).toEqual({ tenantId: inv.tenantId, authUserId: createdAuthId });
    const [user] = await getDbAdmin().select().from(users).where(eq(users.email, inv.email));
    expect(user).toMatchObject({
      fullName: 'Ana Nueva',
      authUserId: createdAuthId,
      status: 'active',
    });
    expect(await membershipOf(inv.tenantId, inv.email)).toMatchObject({
      roles: ['approver'],
      status: 'active',
    });
    const [invitation] = await getDbAdmin()
      .select({ acceptedAt: invitations.acceptedAt })
      .from(invitations)
      .where(eq(invitations.id, inv.invitationId));
    expect(invitation?.acceptedAt).toEqual(clock.now());
    const [event] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, inv.invitationId),
          eq(auditEvents.action, 'invitation.accepted'),
        ),
      );
    expect(event).toMatchObject({
      tenantId: inv.tenantId,
      actorUserId: user?.id,
      actorType: 'user',
      userAgent: CLIENT.userAgent,
    });
    expect(JSON.stringify(event?.data)).not.toContain(inv.token);
  });

  it('una segunda aceptación del mismo enlace se rechaza con invitation_invalid (sin crear otra cuenta)', async () => {
    const inv = await tenantWithInvitation();
    await acceptInvitation(
      { mode: 'new_account', token: inv.token, fullName: 'Ana', password: 'clave-segura-1' },
      deps().deps,
    );
    const second = deps();

    const error = await acceptInvitation(
      { mode: 'new_account', token: inv.token, fullName: 'Ana', password: 'clave-segura-1' },
      second.deps,
    ).catch((e: unknown) => e);

    expect(isDomainError(error) && error.reason).toBe('invitation_invalid');
    expect(second.createUser).not.toHaveBeenCalled();
  });

  it('dos aceptaciones simultáneas (cuenta existente) → una gana y la otra invitation_invalid', async () => {
    const authUserId = randomUUID();
    const existing = await fx.user({ authUserId });
    const inv = await tenantWithInvitation({ email: existing.email });

    const results = await Promise.allSettled([
      acceptInvitation(
        { mode: 'password', token: inv.token, password: 'x' },
        deps({ signInAs: authUserId }).deps,
      ),
      acceptInvitation(
        { mode: 'password', token: inv.token, password: 'x' },
        deps({ signInAs: authUserId }).deps,
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    const reason: unknown = rejected?.status === 'rejected' ? rejected.reason : undefined;
    expect(isDomainError(reason) && reason.reason).toBe('invitation_invalid');
    const count = await getDbAdmin()
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.tenantId, inv.tenantId));
    expect(count[0]?.n).toBe(2);
  });

  it('cuenta existente: solo agrega la membresía (no crea otro usuario)', async () => {
    const authUserId = randomUUID();
    const existing = await fx.user({ authUserId });
    const inv = await tenantWithInvitation({ email: existing.email });
    const { deps: d, createUser } = deps({ signInAs: authUserId });

    await acceptInvitation({ mode: 'password', token: inv.token, password: 'su-clave' }, d);

    expect(createUser).not.toHaveBeenCalled();
    const rows = await getDbAdmin().select().from(users).where(eq(users.email, existing.email));
    expect(rows.map((r) => r.id)).toEqual([existing.id]);
    expect(await membershipOf(inv.tenantId, existing.email)).toMatchObject({ status: 'active' });
  });

  it('reactiva una membresía desactivada con los roles de la invitación', async () => {
    const authUserId = randomUUID();
    const existing = await fx.user({ authUserId });
    const inv = await tenantWithInvitation({ email: existing.email, roles: ['warehouse'] });
    const old = await fx.membership(inv.tenantId, existing.id, {
      roles: ['requester'],
      status: 'disabled',
    });

    await acceptInvitation(
      { mode: 'session', token: inv.token },
      deps({ session: { authUserId, email: existing.email } }).deps,
    );

    expect(await membershipOf(inv.tenantId, existing.email)).toEqual({
      id: old.id,
      roles: ['warehouse'],
      status: 'active',
    });
  });

  it('users.status = disabled → account_disabled y no se marca accepted_at', async () => {
    const existing = await fx.user({ authUserId: randomUUID(), status: 'disabled' });
    const inv = await tenantWithInvitation({ email: existing.email });

    const error = await acceptInvitation(
      { mode: 'password', token: inv.token, password: 'x' },
      deps().deps,
    ).catch((e: unknown) => e);

    expect(isDomainError(error) && error.reason).toBe('account_disabled');
    const [row] = await getDbAdmin()
      .select({ acceptedAt: invitations.acceptedAt })
      .from(invitations)
      .where(eq(invitations.id, inv.invitationId));
    expect(row?.acceptedAt).toBeNull();
  });

  it('si la transacción falla tras crear la cuenta de Auth, se borra (compensación) y no queda usuario', async () => {
    const inv = await tenantWithInvitation();
    const { deps: d, deleteUser, createdAuthId } = deps();
    // Un usuario con el mismo auth_user_id hace fallar el insert de users por la unique.
    await fx.user({ authUserId: createdAuthId });

    await expect(
      acceptInvitation(
        { mode: 'new_account', token: inv.token, fullName: 'Ana', password: 'clave-segura-1' },
        d,
      ),
    ).rejects.toThrow();

    expect(deleteUser).toHaveBeenCalledWith(createdAuthId);
    expect(await getDbAdmin().select().from(users).where(eq(users.email, inv.email))).toEqual([]);
    const [row] = await getDbAdmin()
      .select({ acceptedAt: invitations.acceptedAt })
      .from(invitations)
      .where(eq(invitations.id, inv.invitationId));
    expect(row?.acceptedAt).toBeNull();
  });
});
