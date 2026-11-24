// E1-H3 · Gestión de usuarios con withTenant real (app_user + RLS): aislamiento entre dos tenants,
// concurrencia de cupos (advisory lock seats:) y de último admin (admins:), token solo como hash,
// invited_by y actor desde el ctx y auditoría con IP y navegador.
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '@/db';
import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, invitations, memberships } from '@/db/schema';
import {
  cancelInvitation,
  createUserAdminDeps,
  disableMember,
  inviteUser,
  listMembers,
  resendInvitation,
  updateMemberRoles,
  type UserAdminDeps,
} from '@/modules/identity';
import { hashInvitationToken } from '@/modules/identity/domain/invitation';
import type { Ctx } from '@/shared/context';
import { isDomainError } from '@/shared/errors';
import type { AfterCommitTask } from '@/shared/ports/after-commit';
import type { MailMessage } from '@/shared/ports/mailer';

import { createIdentityFixtures, randomEmail } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
// Reloj fijo lejano: las invitaciones creadas siguen vigentes para el now() de la base, sin
// depender de la hora real.
const clock = new FixedClock(new Date('2990-01-01T00:00:00.000Z'));
const CLIENT = { ip: '198.51.100.23', userAgent: 'vitest-integration' };

interface Harness {
  readonly sent: MailMessage[];
  readonly tasks: AfterCommitTask[];
}

function extras(harness: Harness) {
  return {
    clock,
    logger: new CapturingLogger(),
    client: CLIENT,
    afterCommit: (task: AfterCommitTask) => harness.tasks.push(task),
    mailer: {
      send: (message: MailMessage) => {
        harness.sent.push(message);
        return Promise.resolve({ messageId: 'test' });
      },
    },
    appUrl: 'http://localhost:3000',
  };
}

/** Corre un caso de uso en withTenant(ctx) y luego las tareas de después del commit. */
async function run<T>(
  ctx: Ctx,
  fn: (deps: UserAdminDeps) => Promise<T>,
  wrap: (deps: UserAdminDeps) => UserAdminDeps = (d) => d,
): Promise<{ result: T; sent: MailMessage[] }> {
  const harness: Harness = { sent: [], tasks: [] };
  const result = await withTenant(ctx, (tx) => fn(wrap(createUserAdminDeps(tx, extras(harness)))));
  for (const task of harness.tasks) await task();
  return { result, sent: harness.sent };
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeTenant(overrides: Record<string, unknown> = {}) {
  const tenant = await fx.tenant();
  await fx.settings(tenant.id);
  await fx.subscription(tenant.id, 'starter', { overrides });
  const admin = await fx.user();
  const adminMembership = await fx.membership(tenant.id, admin.id, { roles: ['admin'] });
  const ctx = makeCtx({
    tenantId: tenant.id,
    userId: admin.id,
    roles: ['admin'],
    permissions: ['users.manage'],
  });
  return { tenantId: tenant.id, admin, adminMembership, ctx };
}

let A: Awaited<ReturnType<typeof makeTenant>>;
let B: Awaited<ReturnType<typeof makeTenant>>;
let memberB: { id: string };
let invitationB: { id: string; email: string };

beforeAll(async () => {
  A = await makeTenant();
  B = await makeTenant();
  const userB = await fx.user();
  memberB = await fx.membership(B.tenantId, userB.id, { roles: ['requester'] });
  invitationB = await fx.invitation(B.tenantId);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('aislamiento entre dos tenants (A no ve ni modifica lo de B)', () => {
  it('listar en A no muestra miembros ni invitaciones de B', async () => {
    await fx.invitation(A.tenantId);

    const { result } = await run(A.ctx, (deps) => listMembers(A.ctx, deps));

    expect(result.members.map((m) => m.membershipId)).toEqual([A.adminMembership.id]);
    expect(result.invitations.map((i) => i.invitationId)).not.toContain(invitationB.id);
    expect(result.invitations).toHaveLength(1);
  });

  it('editar roles de una membresía de B desde A → NOT_FOUND y B queda igual', async () => {
    const error = await errorOf(
      run(A.ctx, (deps) =>
        updateMemberRoles(A.ctx, { membershipId: memberB.id, roles: ['admin'] }, deps),
      ),
    );

    expect(error.code).toBe('NOT_FOUND');
    const [row] = await getDbAdmin()
      .select({ roles: memberships.roles })
      .from(memberships)
      .where(eq(memberships.id, memberB.id));
    expect(row?.roles).toEqual(['requester']);
  });

  it('desactivar una membresía de B desde A → NOT_FOUND y B sigue activa', async () => {
    const error = await errorOf(
      run(A.ctx, (deps) => disableMember(A.ctx, { membershipId: memberB.id }, deps)),
    );

    expect(error.code).toBe('NOT_FOUND');
    const [row] = await getDbAdmin()
      .select({ status: memberships.status })
      .from(memberships)
      .where(eq(memberships.id, memberB.id));
    expect(row?.status).toBe('active');
  });

  it('reenviar o anular una invitación de B desde A → NOT_FOUND y no cambia', async () => {
    const before = await getDbAdmin()
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationB.id));

    expect(
      (
        await errorOf(
          run(A.ctx, (deps) => resendInvitation(A.ctx, { invitationId: invitationB.id }, deps)),
        )
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (
        await errorOf(
          run(A.ctx, (deps) => cancelInvitation(A.ctx, { invitationId: invitationB.id }, deps)),
        )
      ).code,
    ).toBe('NOT_FOUND');

    const after = await getDbAdmin()
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationB.id));
    expect(after).toEqual(before);
  });

  it('los repositorios filtran por tenantId además de RLS: en la transacción de A, pedir B devuelve vacío', async () => {
    const { result } = await run(A.ctx, async (deps) => ({
      members: await deps.members.list(B.tenantId),
      invitations: await deps.invitations.listLive(B.tenantId, clock.now()),
      byId: await deps.members.findById(B.tenantId, memberB.id),
    }));

    expect(result).toEqual({ members: [], invitations: [], byId: null });
  });

  it('invitar en A el correo de un miembro de B crea una invitación en A (B no se toca)', async () => {
    const userB = await fx.user();
    await fx.membership(B.tenantId, userB.id);

    const { result } = await run(A.ctx, (deps) =>
      inviteUser(A.ctx, { email: userB.email, roles: ['requester'] }, deps),
    );

    const [row] = await getDbAdmin()
      .select({ tenantId: invitations.tenantId })
      .from(invitations)
      .where(eq(invitations.id, result.invitationId));
    expect(row?.tenantId).toBe(A.tenantId);
  });
});

describe('invitar: token, invited_by, actor y auditoría', () => {
  it('token_hash es el sha256 del token del enlace (≠ token) y el token no aparece en audit_events.data', async () => {
    const email = randomEmail();

    const { result, sent } = await run(A.ctx, (deps) =>
      inviteUser(A.ctx, { email, roles: ['approver'] }, deps),
    );

    const token = String(sent[0]?.data.url).split('/invitacion/')[1] ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await getDbAdmin()
      .select({ tokenHash: invitations.tokenHash })
      .from(invitations)
      .where(eq(invitations.id, result.invitationId));
    expect(row?.tokenHash).toBe(hashInvitationToken(token));
    expect(row?.tokenHash).not.toBe(token);

    const events = await getDbAdmin()
      .select({ data: sql<string>`${auditEvents.data}::text` })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, result.invitationId));
    expect(events).toHaveLength(1);
    expect(events[0]?.data).not.toContain(token);
    expect(events[0]?.data).not.toContain(row?.tokenHash ?? '-');
  });

  it('invitations.invited_by y el actor de audit_events = ctx.userId; auditoría con IP y navegador', async () => {
    const email = randomEmail();

    const { result } = await run(A.ctx, (deps) =>
      inviteUser(A.ctx, { email, roles: ['requester'] }, deps),
    );

    const [invitation] = await getDbAdmin()
      .select({ invitedBy: invitations.invitedBy })
      .from(invitations)
      .where(eq(invitations.id, result.invitationId));
    expect(invitation?.invitedBy).toBe(A.admin.id);
    const [event] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, result.invitationId));
    expect(event).toMatchObject({
      tenantId: A.tenantId,
      actorUserId: A.admin.id,
      actorType: 'user',
      action: 'invitation.created',
      entityType: 'invitation',
      userAgent: CLIENT.userAgent,
      data: { email, roles: ['requester'] },
    });
    expect(String(event?.ip)).toContain(CLIENT.ip);
  });

  it('cada acción queda en audit_events (renovar, reenviar, anular, roles, desactivar)', async () => {
    const t = await makeTenant();
    const email = randomEmail();
    const other = await fx.user();
    const otherMembership = await fx.membership(t.tenantId, other.id, { roles: ['requester'] });

    const { result } = await run(t.ctx, (deps) =>
      inviteUser(t.ctx, { email, roles: ['requester'] }, deps),
    );
    await run(t.ctx, (deps) => inviteUser(t.ctx, { email, roles: ['approver'] }, deps));
    await run(t.ctx, (deps) =>
      resendInvitation(t.ctx, { invitationId: result.invitationId }, deps),
    );
    await run(t.ctx, (deps) =>
      cancelInvitation(t.ctx, { invitationId: result.invitationId }, deps),
    );
    await run(t.ctx, (deps) =>
      updateMemberRoles(t.ctx, { membershipId: otherMembership.id, roles: ['warehouse'] }, deps),
    );
    await run(t.ctx, (deps) => disableMember(t.ctx, { membershipId: otherMembership.id }, deps));

    const events = await getDbAdmin()
      .select({ action: auditEvents.action, actor: auditEvents.actorUserId })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, t.tenantId))
      .orderBy(auditEvents.createdAt);
    expect(events.map((e) => e.action).sort()).toEqual(
      [
        'invitation.created',
        'invitation.renewed',
        'invitation.resent',
        'invitation.cancelled',
        'membership.roles_updated',
        'membership.disabled',
      ].sort(),
    );
    expect(new Set(events.map((e) => e.actor))).toEqual(new Set([t.admin.id]));
  });
});

describe('invitación aceptada entre la lectura y el UPDATE (reenviar, anular)', () => {
  /** Marca la invitación aceptada (conexión dueño, otra transacción) justo después de leerla. */
  const acceptAfterRead = (deps: UserAdminDeps): UserAdminDeps => ({
    ...deps,
    invitations: {
      ...deps.invitations,
      findPendingById: async (tenantId, invitationId) => {
        const row = await deps.invitations.findPendingById(tenantId, invitationId);
        await getDbAdmin()
          .update(invitations)
          .set({ acceptedAt: clock.now() })
          .where(eq(invitations.id, invitationId));
        return row;
      },
    },
  });

  it.each([
    ['reenviar', 'invitation.resent', resendInvitation],
    ['anular', 'invitation.cancelled', cancelInvitation],
  ] as const)('%s → NOT_FOUND, sin auditoría ni correo programado', async (_l, action, useCase) => {
    const t = await makeTenant();
    const invitation = await fx.invitation(t.tenantId);
    const harness: Harness = { sent: [], tasks: [] };

    const error = await errorOf(
      withTenant(t.ctx, (tx) =>
        useCase(
          t.ctx,
          { invitationId: invitation.id },
          acceptAfterRead(createUserAdminDeps(tx, extras(harness))),
        ),
      ),
    );

    expect(error.code).toBe('NOT_FOUND');
    expect(harness.tasks).toHaveLength(0);
    const events = await getDbAdmin()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, invitation.id), eq(auditEvents.action, action)));
    expect(events).toEqual([]);
  });
});

describe('concurrencia', () => {
  it('cupo: con max_users = usados + 1, dos invitaciones simultáneas → una pasa y la otra LIMIT_EXCEEDED', async () => {
    // 1 miembro activo (el admin) → max_users 2 deja un solo cupo.
    const t = await makeTenant({ max_users: 2 });
    // Retrasa la respuesta de canAddUser: sin el bloqueo seats:, ambas leerían el mismo conteo.
    const slow = (deps: UserAdminDeps): UserAdminDeps => ({
      ...deps,
      entitlements: {
        ...deps.entitlements,
        canAddUser: async (tenantId) => {
          const capacity = await deps.entitlements.canAddUser(tenantId);
          await delay(300);
          return capacity;
        },
      },
    });

    const results = await Promise.allSettled([
      run(
        t.ctx,
        (deps) => inviteUser(t.ctx, { email: randomEmail(), roles: ['requester'] }, deps),
        slow,
      ),
      run(
        t.ctx,
        (deps) => inviteUser(t.ctx, { email: randomEmail(), roles: ['requester'] }, deps),
        slow,
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason: unknown = rejected[0]?.reason;
    expect(isDomainError(reason) && [reason.code, reason.reason, reason.params]).toEqual([
      'LIMIT_EXCEEDED',
      'max_users',
      { max: 2 },
    ]);
    const pending = await getDbAdmin()
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.tenantId, t.tenantId));
    expect(pending).toHaveLength(1);
  });

  it('último admin: dos admins se quitan el rol a la vez → uno pasa y el otro da last_admin', async () => {
    const t = await makeTenant();
    const second = await fx.user();
    const secondMembership = await fx.membership(t.tenantId, second.id, { roles: ['admin'] });
    const ctx2 = makeCtx({
      tenantId: t.tenantId,
      userId: second.id,
      roles: ['admin'],
      permissions: ['users.manage'],
    });
    // Retrasa la lectura de miembros: sin el bloqueo admins:, ambos verían dos admins.
    const slow = (deps: UserAdminDeps): UserAdminDeps => ({
      ...deps,
      members: {
        ...deps.members,
        list: async (tenantId) => {
          const rows = await deps.members.list(tenantId);
          await delay(300);
          return rows;
        },
      },
    });

    const results = await Promise.allSettled([
      run(
        t.ctx,
        (deps) =>
          updateMemberRoles(
            t.ctx,
            { membershipId: t.adminMembership.id, roles: ['requester'] },
            deps,
          ),
        slow,
      ),
      run(
        ctx2,
        (deps) =>
          updateMemberRoles(ctx2, { membershipId: secondMembership.id, roles: ['approver'] }, deps),
        slow,
      ),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    const reason: unknown = rejected[0]?.reason;
    expect(isDomainError(reason) && reason.reason).toBe('last_admin');
    const admins = await getDbAdmin()
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, t.tenantId),
          eq(memberships.status, 'active'),
          sql`'admin' = any(${memberships.roles})`,
        ),
      );
    expect(admins).toHaveLength(1);
  });
});
