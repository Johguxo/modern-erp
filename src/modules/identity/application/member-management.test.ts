// E1-H3 · Gestión de miembros e invitaciones con fakes: último admin (por users.manage), no
// auto-desactivarse, reactivar revisa el cupo, reenviar/anular, listar y auditoría desde el ctx.
import { makeCtx, TEST_TENANT_ID, TEST_USER_ID } from '@tests/support/ctx';
import { createInMemoryUserAdmin } from '@tests/support/fakes/in-memory-user-admin';
import { describe, expect, it } from 'vitest';

import { isDomainError } from '@/shared/errors';

import { invitationExpiresAt } from '../domain/invitation';

import { cancelInvitation } from './cancel-invitation';
import { disableMember } from './disable-member';
import { listMembers } from './list-members';
import { reactivateMember } from './reactivate-member';
import { resendInvitation } from './resend-invitation';
import { updateMemberRoles } from './update-member-roles';

const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';
const admin = makeCtx({ roles: ['admin'], permissions: ['users.manage'] });
const noPermission = makeCtx({ roles: ['requester'] });

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

function setup() {
  const fake = createInMemoryUserAdmin();
  const self = fake.addMember(TEST_TENANT_ID, { userId: TEST_USER_ID, roles: ['admin'] });
  const requester = fake.addMember(TEST_TENANT_ID, { userId: 'u-req', roles: ['requester'] });
  return { fake, self, requester };
}

describe('updateMemberRoles', () => {
  it('un admin no puede quitarse a sí mismo el rol admin si es el último admin (last_admin)', async () => {
    const { fake, self } = setup();

    const error = await errorOf(
      updateMemberRoles(
        admin,
        { membershipId: self.membershipId, roles: ['requester'] },
        fake.deps,
      ),
    );

    expect(error).toMatchObject({ code: 'FORBIDDEN', reason: 'last_admin' });
    expect(fake.members[0]?.roles).toEqual(['admin']);
    expect(fake.audit).toHaveLength(0);
    expect(fake.locks).toEqual([`admins:${TEST_TENANT_ID}`]);
  });

  it('con otro admin activo sí puede quitarse el rol admin', async () => {
    const { fake, self } = setup();
    fake.addMember(TEST_TENANT_ID, { userId: 'u-admin2', roles: ['admin'] });

    await updateMemberRoles(
      admin,
      { membershipId: self.membershipId, roles: ['approver'] },
      fake.deps,
    );

    expect(fake.members[0]?.roles).toEqual(['approver']);
  });

  it('un admin desactivado no cuenta como el otro admin', async () => {
    const { fake, self } = setup();
    fake.addMember(TEST_TENANT_ID, { userId: 'u-admin2', roles: ['admin'], status: 'disabled' });

    const error = await errorOf(
      updateMemberRoles(admin, { membershipId: self.membershipId, roles: ['approver'] }, fake.deps),
    );

    expect(error.reason).toBe('last_admin');
  });

  it('cambia los roles de otro miembro y audita antes/después con el actor del ctx', async () => {
    const { fake, requester } = setup();

    await updateMemberRoles(
      admin,
      { membershipId: requester.membershipId, roles: ['approver', 'warehouse'] },
      fake.deps,
    );

    expect(fake.members[1]?.roles).toEqual(['approver', 'warehouse']);
    expect(fake.audit).toEqual([
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        actorUserId: TEST_USER_ID,
        action: 'membership.roles_updated',
        entityId: requester.membershipId,
        data: { userId: 'u-req', before: ['requester'], after: ['approver', 'warehouse'] },
      }),
    ]);
  });

  it('una membresía de otro tenant → NOT_FOUND (no la toca)', async () => {
    const { fake } = setup();
    const foreign = fake.addMember(OTHER_TENANT, { userId: 'u-b', roles: ['requester'] });

    const error = await errorOf(
      updateMemberRoles(admin, { membershipId: foreign.membershipId, roles: ['admin'] }, fake.deps),
    );

    expect(error.code).toBe('NOT_FOUND');
    expect(fake.members.find((m) => m.tenantId === OTHER_TENANT)?.roles).toEqual(['requester']);
  });

  it('sin users.manage → FORBIDDEN', async () => {
    const { fake, requester } = setup();
    const error = await errorOf(
      updateMemberRoles(
        noPermission,
        { membershipId: requester.membershipId, roles: ['admin'] },
        fake.deps,
      ),
    );
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('disableMember', () => {
  it('nadie puede desactivarse a sí mismo (cannot_disable_self)', async () => {
    const { fake, self } = setup();
    fake.addMember(TEST_TENANT_ID, { userId: 'u-admin2', roles: ['admin'] });

    const error = await errorOf(
      disableMember(admin, { membershipId: self.membershipId }, fake.deps),
    );

    expect(error).toMatchObject({ code: 'FORBIDDEN', reason: 'cannot_disable_self' });
    expect(fake.members[0]?.membershipStatus).toBe('active');
  });

  it('no puede desactivar al último admin (aunque lo haga otro gestor sin rol admin activo)', async () => {
    const fake = createInMemoryUserAdmin();
    const onlyAdmin = fake.addMember(TEST_TENANT_ID, { userId: 'u-admin', roles: ['admin'] });
    // El actor tiene users.manage por el ctx, pero su membresía ya está desactivada.
    fake.addMember(TEST_TENANT_ID, { userId: TEST_USER_ID, roles: ['admin'], status: 'disabled' });

    const error = await errorOf(
      disableMember(admin, { membershipId: onlyAdmin.membershipId }, fake.deps),
    );

    expect(error.reason).toBe('last_admin');
  });

  it('desactiva a otro miembro y audita con el actor del ctx', async () => {
    const { fake, requester } = setup();

    await disableMember(admin, { membershipId: requester.membershipId }, fake.deps);

    expect(fake.members[1]?.membershipStatus).toBe('disabled');
    expect(fake.audit).toEqual([
      expect.objectContaining({
        actorUserId: TEST_USER_ID,
        action: 'membership.disabled',
        entityId: requester.membershipId,
      }),
    ]);
  });

  it('una membresía de otro tenant → NOT_FOUND', async () => {
    const { fake } = setup();
    const foreign = fake.addMember(OTHER_TENANT, { userId: 'u-b', roles: ['requester'] });

    const error = await errorOf(
      disableMember(admin, { membershipId: foreign.membershipId }, fake.deps),
    );

    expect(error.code).toBe('NOT_FOUND');
    expect(fake.members.at(-1)?.membershipStatus).toBe('active');
  });
});

describe('reactivateMember', () => {
  it('revisa el cupo con el bloqueo de cupos: sin cupo → max_users', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      roles: ['requester'],
      status: 'disabled',
    });
    fake.setCapacity({ allowed: false, limit: 2, used: 2, reason: 'limit_reached' });

    const error = await errorOf(
      reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps),
    );

    expect(fake.locks).toEqual([`seats:${TEST_TENANT_ID}`]);
    expect(error).toMatchObject({
      code: 'LIMIT_EXCEEDED',
      reason: 'max_users',
      params: { max: 2 },
    });
    expect(fake.members.at(-1)?.membershipStatus).toBe('disabled');
  });

  it('con cupo reactiva y audita', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      roles: ['requester'],
      status: 'disabled',
    });

    await reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps);

    expect(fake.members.at(-1)?.membershipStatus).toBe('active');
    expect(fake.audit[0]).toMatchObject({
      action: 'membership.reactivated',
      actorUserId: TEST_USER_ID,
    });
  });
});

describe('reactivateMember · invitación pendiente del mismo correo', () => {
  it('anula la invitación vigente del correo (solo de este tenant) y audita la anulación', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      email: 'ana@genrent.pe',
      roles: ['requester'],
      status: 'disabled',
    });
    const invitation = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });
    const other = fake.addInvitation(OTHER_TENANT, { email: 'ana@genrent.pe' });

    await reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps);

    expect(fake.invitations.find((i) => i.id === invitation.id)?.expiresAt).toEqual(
      fake.clock.now(),
    );
    expect(fake.invitations.find((i) => i.id === other.id)?.expiresAt).toEqual(other.expiresAt);
    expect(fake.audit.map((e) => [e.action, e.entityId])).toEqual([
      ['invitation.cancelled', invitation.id],
      ['membership.reactivated', disabled.membershipId],
    ]);
    expect(fake.audit[0]?.data).toEqual({ email: 'ana@genrent.pe', reason: 'member_reactivated' });
  });

  it('con el plan lleno sí reactiva: el cupo de la invitación pasa a la membresía', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      email: 'ana@genrent.pe',
      roles: ['requester'],
      status: 'disabled',
    });
    fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });
    fake.setCapacity({ allowed: false, limit: 3, used: 3, reason: 'limit_reached' });

    await reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps);

    expect(fake.members.at(-1)?.membershipStatus).toBe('active');
  });

  it('en solo lectura no reactiva aunque haya invitación, y no la anula', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      email: 'ana@genrent.pe',
      roles: ['requester'],
      status: 'disabled',
    });
    const invitation = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });
    fake.setCapacity({ allowed: false, limit: 3, used: 1, reason: 'read_only' });

    const error = await errorOf(
      reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps),
    );

    expect(error.reason).toBe('tenant_read_only');
    expect(fake.invitations[0]?.expiresAt).toEqual(invitation.expiresAt);
    expect(fake.members.at(-1)?.membershipStatus).toBe('disabled');
  });

  it('una invitación ya vencida del correo no se toca', async () => {
    const { fake } = setup();
    const disabled = fake.addMember(TEST_TENANT_ID, {
      userId: 'u-off',
      email: 'ana@genrent.pe',
      roles: ['requester'],
      status: 'disabled',
    });
    const expiredAt = new Date(fake.clock.now().getTime() - 1000);
    fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe', expiresAt: expiredAt });

    await reactivateMember(admin, { membershipId: disabled.membershipId }, fake.deps);

    expect(fake.invitations[0]?.expiresAt).toEqual(expiredAt);
    expect(fake.audit.map((e) => e.action)).toEqual(['membership.reactivated']);
  });
});

describe('resendInvitation y cancelInvitation', () => {
  it('reenviar renueva el token y el vencimiento de la misma fila y audita', async () => {
    const { fake } = setup();
    const invitation = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });

    const result = await resendInvitation(admin, { invitationId: invitation.id }, fake.deps);

    expect(result).toEqual({ emailSent: false });
    expect(fake.invitations[0]).toMatchObject({
      id: invitation.id,
      invitedBy: TEST_USER_ID,
      expiresAt: invitationExpiresAt(fake.clock.now()),
    });
    expect(fake.invitations[0]?.tokenHash).not.toBe('old-hash');
    expect(fake.capacityCalls).toHaveLength(0);
    expect(fake.audit[0]).toMatchObject({ action: 'invitation.resent', actorUserId: TEST_USER_ID });
    expect(await fake.runAfterCommit()).toEqual({ emailSent: true });
  });

  it('reenviar una vencida sin cupo → max_users', async () => {
    const { fake } = setup();
    const invitation = fake.addInvitation(TEST_TENANT_ID, {
      email: 'ana@genrent.pe',
      expiresAt: new Date(fake.clock.now().getTime() - 1),
    });
    fake.setCapacity({ allowed: false, limit: 2, used: 2, reason: 'limit_reached' });

    const error = await errorOf(
      resendInvitation(admin, { invitationId: invitation.id }, fake.deps),
    );

    expect(error.reason).toBe('max_users');
  });

  it('reenviar una invitación de otro tenant → NOT_FOUND', async () => {
    const { fake } = setup();
    const foreign = fake.addInvitation(OTHER_TENANT, { email: 'b@b.pe' });

    const error = await errorOf(resendInvitation(admin, { invitationId: foreign.id }, fake.deps));

    expect(error.code).toBe('NOT_FOUND');
  });

  it('anular vence la invitación ahora y audita', async () => {
    const { fake } = setup();
    const invitation = fake.addInvitation(TEST_TENANT_ID, { email: 'ana@genrent.pe' });

    await cancelInvitation(admin, { invitationId: invitation.id }, fake.deps);

    expect(fake.invitations[0]?.expiresAt).toEqual(fake.clock.now());
    expect(fake.audit[0]).toMatchObject({
      action: 'invitation.cancelled',
      actorUserId: TEST_USER_ID,
    });
  });
});

describe('listMembers', () => {
  it('solo los del tenant del ctx, marca al propio usuario y no lista vencidas', async () => {
    const { fake } = setup();
    fake.addMember(OTHER_TENANT, { userId: 'u-b', roles: ['admin'] });
    fake.addInvitation(TEST_TENANT_ID, { email: 'viva@genrent.pe' });
    fake.addInvitation(TEST_TENANT_ID, {
      email: 'vencida@genrent.pe',
      expiresAt: new Date(fake.clock.now().getTime() - 1),
    });
    fake.addInvitation(OTHER_TENANT, { email: 'b@b.pe' });

    const result = await listMembers(admin, fake.deps);

    expect(result.members.map((m) => [m.membershipId, m.isSelf])).toEqual([
      [fake.members[0]?.membershipId, true],
      [fake.members[1]?.membershipId, false],
    ]);
    expect(result.invitations.map((i) => i.email)).toEqual(['viva@genrent.pe']);
    expect(result.seats).toEqual({ used: 1, limit: 10 });
  });

  it('sin users.manage → FORBIDDEN', async () => {
    const { fake } = setup();
    expect((await errorOf(listMembers(noPermission, fake.deps))).code).toBe('FORBIDDEN');
  });
});
