// E1-H3 · Invitar con fakes: cupo (canAddUser y su reason), renovar una pendiente, already_member,
// invited_by y actor desde el ctx, token solo como hash y correo después del commit.
import { makeCtx, TEST_TENANT_ID, TEST_USER_ID } from '@tests/support/ctx';
import { createInMemoryUserAdmin } from '@tests/support/fakes/in-memory-user-admin';
import { describe, expect, it } from 'vitest';

import { isDomainError } from '@/shared/errors';

import { hashInvitationToken, invitationExpiresAt } from '../domain/invitation';
import * as inviteUserContract from '../contracts/invite-user';

import { inviteUser } from './invite-user';

const admin = makeCtx({ roles: ['admin'], permissions: ['users.manage'] });
const input = { email: 'ana@genrent.pe', roles: ['requester' as const] };

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

/** Token del enlace enviado por correo. */
function tokenOf(url: unknown): string {
  return String(url).split('/invitacion/')[1] ?? '';
}

describe('inviteUser', () => {
  it('sin users.manage → FORBIDDEN, sin tocar nada', async () => {
    const fake = createInMemoryUserAdmin();
    const error = await errorOf(inviteUser(makeCtx(), input, fake.deps));

    expect(error.code).toBe('FORBIDDEN');
    expect(fake.invitations).toHaveLength(0);
    expect(fake.locks).toHaveLength(0);
  });

  it('crea la invitación bajo el bloqueo de cupos, con vencimiento en 7 días y solo el hash del token', async () => {
    const fake = createInMemoryUserAdmin();

    const result = await inviteUser(admin, input, fake.deps);

    expect(fake.locks).toEqual([`seats:${TEST_TENANT_ID}`]);
    expect(fake.capacityCalls).toEqual([TEST_TENANT_ID]);
    const [stored] = fake.invitations;
    expect(stored).toMatchObject({
      id: result.invitationId,
      tenantId: TEST_TENANT_ID,
      email: 'ana@genrent.pe',
      roles: ['requester'],
      expiresAt: invitationExpiresAt(fake.clock.now()),
    });
    // El token viaja solo en el correo; en la base queda su sha256.
    await fake.runAfterCommit();
    const token = tokenOf(fake.sent[0]?.data.url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored?.tokenHash).toBe(hashInvitationToken(token));
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('invitations.invited_by y el actor de audit_events salen del ctx', async () => {
    const fake = createInMemoryUserAdmin();

    await inviteUser(admin, input, fake.deps);

    expect(fake.invitations[0]?.invitedBy).toBe(TEST_USER_ID);
    expect(fake.audit).toEqual([
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        actorUserId: TEST_USER_ID,
        actorType: 'user',
        action: 'invitation.created',
        entityType: 'invitation',
        ip: '203.0.113.7',
        userAgent: 'vitest',
      }),
    ]);
  });

  it('el contrato descarta invitedBy, actor y tenantId que mande el cliente', () => {
    const parsed = inviteUserContract.inputSchema.parse({
      ...input,
      invitedBy: 'attacker',
      actorUserId: 'attacker',
      tenantId: 'other-tenant',
    });

    expect(parsed).toEqual({ email: 'ana@genrent.pe', roles: ['requester'] });
  });

  it('el token no aparece en la auditoría ni en los logs', async () => {
    const fake = createInMemoryUserAdmin();
    fake.failMailer();

    await inviteUser(admin, input, fake.deps);
    await fake.runAfterCommit();

    const hash = fake.invitations[0]?.tokenHash ?? '';
    const auditText = JSON.stringify(fake.audit);
    const logText = JSON.stringify(fake.logger.entries);
    expect(auditText).not.toContain(hash);
    // Ninguna cadena de 43 caracteres base64url (el token) en auditoría ni logs.
    expect(auditText).not.toMatch(/[A-Za-z0-9_-]{43}/);
    expect(logText).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it('correo ya miembro activo → CONFLICT already_member, sin revisar cupo ni crear', async () => {
    const fake = createInMemoryUserAdmin();
    fake.addMember(TEST_TENANT_ID, {
      userId: 'u-ana',
      email: 'ana@genrent.pe',
      roles: ['requester'],
    });

    const error = await errorOf(inviteUser(admin, input, fake.deps));

    expect(error).toMatchObject({ code: 'CONFLICT', reason: 'already_member' });
    expect(fake.invitations).toHaveLength(0);
    expect(fake.capacityCalls).toHaveLength(0);
  });

  it('un miembro desactivado sí se puede volver a invitar', async () => {
    const fake = createInMemoryUserAdmin();
    fake.addMember(TEST_TENANT_ID, {
      userId: 'u-ana',
      email: 'ana@genrent.pe',
      roles: ['requester'],
      status: 'disabled',
    });

    await inviteUser(admin, input, fake.deps);

    expect(fake.invitations).toHaveLength(1);
  });

  it('con una invitación pendiente vigente la renueva (misma fila, token nuevo) sin revisar el cupo', async () => {
    const fake = createInMemoryUserAdmin();
    const old = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });
    fake.setCapacity({ allowed: false, limit: 1, used: 1, reason: 'limit_reached' });

    const result = await inviteUser(
      admin,
      { email: 'ana@genrent.pe', roles: ['approver'] },
      fake.deps,
    );

    expect(result.invitationId).toBe(old.id);
    expect(fake.capacityCalls).toHaveLength(0);
    expect(fake.invitations).toHaveLength(1);
    expect(fake.invitations[0]).toMatchObject({
      roles: ['approver'],
      invitedBy: TEST_USER_ID,
      expiresAt: invitationExpiresAt(fake.clock.now()),
    });
    expect(fake.invitations[0]?.tokenHash).not.toBe('old-hash');
    expect(fake.audit[0]?.action).toBe('invitation.renewed');
  });

  it('la pendiente se aceptó entre la lectura y el UPDATE → NOT_FOUND, sin auditar ni programar el correo', async () => {
    const fake = createInMemoryUserAdmin();
    const old = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });
    const deps = {
      ...fake.deps,
      invitations: {
        ...fake.deps.invitations,
        findPendingByEmail: async (tenantId: string, email: string) => {
          const found = await fake.deps.invitations.findPendingByEmail(tenantId, email);
          // Otro request acepta la invitación justo después de leerla.
          fake.invitations.splice(0, 1, { ...old, acceptedAt: fake.clock.now() });
          return found;
        },
      },
    };

    const error = await errorOf(inviteUser(admin, input, deps));

    expect(error.code).toBe('NOT_FOUND');
    expect(fake.audit).toHaveLength(0);
    expect(await fake.runAfterCommit()).toEqual({});
    expect(fake.sent).toHaveLength(0);
  });

  it('con una invitación pendiente vencida sí revisa el cupo antes de renovarla', async () => {
    const fake = createInMemoryUserAdmin();
    fake.addInvitation(TEST_TENANT_ID, {
      email: 'ana@genrent.pe',
      expiresAt: new Date(fake.clock.now().getTime() - 1),
    });
    fake.setCapacity({ allowed: false, limit: 3, used: 3, reason: 'limit_reached' });

    const error = await errorOf(inviteUser(admin, input, fake.deps));

    expect(fake.capacityCalls).toEqual([TEST_TENANT_ID]);
    expect(error).toMatchObject({
      code: 'LIMIT_EXCEEDED',
      reason: 'max_users',
      params: { max: 3 },
    });
    expect(fake.invitations[0]?.tokenHash).toBe('old-hash');
  });

  it.each([
    [{ reason: 'limit_reached' as const, limit: 5 }, 'LIMIT_EXCEEDED', 'max_users'],
    [{ reason: 'read_only' as const, limit: 5 }, 'FORBIDDEN', 'tenant_read_only'],
    [{ reason: 'no_subscription' as const, limit: null }, 'FORBIDDEN', 'no_subscription'],
  ])('sin cupo (%o) → %s %s, sin crear la invitación', async (capacity, code, reason) => {
    const fake = createInMemoryUserAdmin();
    fake.setCapacity({ allowed: false, used: 5, ...capacity });

    const error = await errorOf(inviteUser(admin, input, fake.deps));

    expect(error).toMatchObject({ code, reason });
    expect(fake.invitations).toHaveLength(0);
    expect(fake.audit).toHaveLength(0);
    expect(fake.sent).toHaveLength(0);
  });

  it('el correo se envía después del commit con el enlace /invitacion/<token> y 7 días', async () => {
    const fake = createInMemoryUserAdmin({ appUrl: 'https://app.linkus.pe' });

    const result = await inviteUser(admin, input, fake.deps);

    // Antes del commit no sale nada.
    expect(fake.sent).toHaveLength(0);
    expect(result.emailSent).toBe(false);
    expect(await fake.runAfterCommit()).toEqual({ emailSent: true });
    expect(fake.sent).toEqual([
      expect.objectContaining({
        to: ['ana@genrent.pe'],
        template: 'identity.invitation',
        tenantId: TEST_TENANT_ID,
        data: expect.objectContaining({ tenantName: 'Genrent', expiresInDays: 7 }) as object,
      }),
    ]);
    expect(String(fake.sent[0]?.data.url)).toMatch(
      /^https:\/\/app\.linkus\.pe\/invitacion\/[A-Za-z0-9_-]{43}$/,
    );
  });

  it('si el Mailer falla: emailSent false, la invitación y la auditoría quedan y se registra un warn sin el token', async () => {
    const fake = createInMemoryUserAdmin();
    fake.failMailer();

    await inviteUser(admin, input, fake.deps);

    expect(await fake.runAfterCommit()).toEqual({ emailSent: false });
    expect(fake.invitations).toHaveLength(1);
    expect(fake.audit).toHaveLength(1);
    const warn = fake.logger.find('invitation email failed');
    expect(warn?.level).toBe('warn');
    expect(warn?.fields).toMatchObject({ invitationId: fake.invitations[0]?.id });
  });
});
