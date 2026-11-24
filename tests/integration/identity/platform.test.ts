// E1-H4 · Consola de plataforma con la base real (conexión dueño): alta de cliente transaccional,
// slug duplicado, cambios de suscripción y solo lectura, invitar al admin del cliente, lista y
// detalle sin mezclar clientes, revisión de SuperAdmin dentro de la transacción y el script del
// primer SuperAdmin (Auth con fakes: no hay FK a auth.users).
import { randomUUID } from 'node:crypto';

import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import {
  auditEvents,
  invitations,
  platformAdmins,
  subscriptions,
  tenantSettings,
  tenants,
  users,
} from '@/db/schema';
import {
  bootstrapPlatformAdmin,
  createEntitlementsFor,
  createPlatformStore,
  createTenant,
  getTenant,
  inviteTenantAdmin,
  listTenants,
  updateSubscription,
  type PlatformDeps,
  type TenantSetupStepFactory,
} from '@/modules/identity';
import { INVITATION_TTL_DAYS } from '@/modules/identity/domain/invitation';
import type { PlatformCtx } from '@/shared/context';
import { isDomainError } from '@/shared/errors';
import type { AfterCommitTask } from '@/shared/ports/after-commit';
import type { AuthAdmin } from '@/shared/ports/auth-admin';
import type { MailMessage } from '@/shared/ports/mailer';

import { createIdentityFixtures, randomEmail, randomSlug } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const CLIENT = { ip: '198.51.100.44', userAgent: 'vitest-platform' };
let ctx: PlatformCtx;

beforeAll(async () => {
  const admin = await fx.user();
  await fx.platformAdmin(admin.id);
  ctx = { userId: admin.id, requestId: 'req-platform' };
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

function platform(steps: TenantSetupStepFactory[] = []) {
  const sent: MailMessage[] = [];
  const tasks: AfterCommitTask[] = [];
  const deps: PlatformDeps = {
    store: createPlatformStore(steps, getDbAdmin()),
    mailer: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve({ messageId: 'm' });
      },
    },
    clock: new FixedClock(new Date()),
    logger: new CapturingLogger(),
    client: CLIENT,
    afterCommit: (task) => tasks.push(task),
    appUrl: 'http://localhost:3000',
  };
  return {
    deps,
    sent,
    runAfterCommit: async () => {
      for (const task of tasks.splice(0)) await task();
    },
  };
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

function newTenantInput(overrides: Partial<Parameters<typeof createTenant>[1]> = {}) {
  return {
    name: 'Cliente de prueba',
    slug: randomSlug(),
    planCode: 'starter',
    maxUsers: null,
    currency: 'USD' as const,
    adminEmail: randomEmail(),
    ...overrides,
  };
}

async function create(input = newTenantInput(), steps: TenantSetupStepFactory[] = []) {
  const p = platform(steps);
  const result = await createTenant(ctx, input, p.deps);
  fx.trackTenant(result.tenantId);
  return { ...result, input, p };
}

describe('createTenant', () => {
  it('crea tenant, ajustes, suscripción activa, invitación admin y auditoría en una transacción', async () => {
    const { tenantId, invitationId, input, p } = await create(newTenantInput({ maxUsers: 7 }));
    const db = getDbAdmin();

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(tenant).toMatchObject({ name: input.name, slug: input.slug, status: 'active' });
    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    expect(settings).toMatchObject({ currency: 'USD', timezone: 'America/Lima', locale: 'es-PE' });
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    expect(subs).toEqual([
      expect.objectContaining({ status: 'active', overrides: { max_users: 7 } }),
    ]);

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    expect(invitation).toMatchObject({
      tenantId,
      email: input.adminEmail,
      roles: ['admin'],
      invitedBy: ctx.userId,
      acceptedAt: null,
    });
    const days = (invitation!.expiresAt.getTime() - p.deps.clock.now().getTime()) / 86_400_000;
    expect(days).toBeCloseTo(INVITATION_TTL_DAYS, 3);

    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(auditEvents.createdAt);
    expect(audit.map((a) => [a.action, a.actorType, a.actorUserId])).toEqual([
      ['tenant.created', 'platform_admin', ctx.userId],
      ['invitation.created', 'platform_admin', ctx.userId],
    ]);
    expect(audit.map((a) => a.ip)).toEqual([CLIENT.ip, CLIENT.ip]);

    // Con 7 usuarios de override y la invitación pendiente: 1 de 7.
    expect(await createEntitlementsFor(db).canAddUser(tenantId)).toMatchObject({
      allowed: true,
      limit: 7,
      used: 1,
    });

    await p.runAfterCommit();
    expect(p.sent[0]?.to).toEqual([input.adminEmail]);
  });

  it('atomicidad: si un paso de alta falla no queda ni el tenant ni la invitación', async () => {
    const input = newTenantInput();
    const failing: TenantSetupStepFactory = () => ({
      run: () => Promise.reject(new Error('setup step failed')),
    });
    const p = platform([failing]);

    await expect(createTenant(ctx, input, p.deps)).rejects.toThrow('setup step failed');

    const db = getDbAdmin();
    expect(await db.select().from(tenants).where(eq(tenants.slug, input.slug))).toHaveLength(0);
    expect(
      await db.select().from(invitations).where(eq(invitations.email, input.adminEmail)),
    ).toHaveLength(0);
  });

  it('los pasos de alta corren en la misma transacción con el tenant ya creado', async () => {
    const seen: string[] = [];
    const step: TenantSetupStepFactory = (db) => ({
      async run({ tenantId }) {
        const rows = await db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        seen.push(rows[0]?.id ?? 'missing');
      },
    });
    const { tenantId } = await create(newTenantInput(), [step]);
    expect(seen).toEqual([tenantId]);
  });

  it('slug duplicado → VALIDATION slug_taken en el campo slug', async () => {
    const existing = await fx.tenant();
    const error = await errorOf(
      createTenant(ctx, newTenantInput({ slug: existing.slug }), platform().deps),
    );
    expect(error).toMatchObject({ code: 'VALIDATION', reason: 'slug_taken' });
  });

  it('quien no está en platform_admins → FORBIDDEN y no escribe nada', async () => {
    const outsider = await fx.user();
    const input = newTenantInput();
    const error = await errorOf(
      createTenant({ userId: outsider.id, requestId: 'r' }, input, platform().deps),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(
      await getDbAdmin().select().from(tenants).where(eq(tenants.slug, input.slug)),
    ).toHaveLength(0);
  });
});

describe('updateSubscription', () => {
  it('suspender deja al cliente en solo lectura; reactivar lo devuelve', async () => {
    const { tenantId } = await create();
    const entitlements = createEntitlementsFor(getDbAdmin());
    const base = { tenantId, planCode: 'starter', maxUsers: null };

    await updateSubscription(ctx, { ...base, status: 'suspended' }, platform().deps);
    expect(await entitlements.isReadOnly(tenantId)).toBe(true);

    await updateSubscription(ctx, { ...base, status: 'active' }, platform().deps);
    expect(await entitlements.isReadOnly(tenantId)).toBe(false);
  });

  it('cambiar plan y límite se refleja en canAddUser y se audita con from/to', async () => {
    const { tenantId } = await create();
    await updateSubscription(
      ctx,
      { tenantId, planCode: 'business', status: 'active', maxUsers: 1 },
      platform().deps,
    );

    // 1 invitación pendiente y límite 1: lleno.
    expect(await createEntitlementsFor(getDbAdmin()).canAddUser(tenantId)).toMatchObject({
      allowed: false,
      limit: 1,
      reason: 'limit_reached',
    });
    const [event] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.action, 'subscription.updated')),
      );
    expect(event?.data).toEqual({
      from: { planCode: 'starter', status: 'active', overrides: {} },
      to: { planCode: 'business', status: 'active', overrides: { max_users: 1 } },
    });
  });

  it('cancelar y reactivar deja dos filas y una sola vigente', async () => {
    const { tenantId } = await create();
    const base = { tenantId, planCode: 'starter', maxUsers: null };
    await updateSubscription(ctx, { ...base, status: 'cancelled' }, platform().deps);
    await updateSubscription(ctx, { ...base, status: 'trial' }, platform().deps);

    const rows = await getDbAdmin()
      .select({ status: subscriptions.status, endsAt: subscriptions.endsAt })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    expect(rows.map((r) => r.status).sort()).toEqual(['cancelled', 'trial']);
    expect(rows.find((r) => r.status === 'cancelled')?.endsAt).not.toBeNull();
  });

  it('sin cambios no audita; otro tenant no se toca', async () => {
    const a = await create();
    const b = await create();
    const result = await updateSubscription(
      ctx,
      { tenantId: a.tenantId, planCode: 'starter', status: 'past_due', maxUsers: null },
      platform().deps,
    );
    expect(result).toEqual({ changed: true });
    const again = await updateSubscription(
      ctx,
      { tenantId: a.tenantId, planCode: 'starter', status: 'past_due', maxUsers: null },
      platform().deps,
    );
    expect(again).toEqual({ changed: false });

    const [other] = await getDbAdmin()
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, b.tenantId));
    expect(other?.status).toBe('active');
  });

  it('no SuperAdmin → FORBIDDEN', async () => {
    const { tenantId } = await create();
    const outsider = await fx.user();
    const error = await errorOf(
      updateSubscription(
        { userId: outsider.id, requestId: 'r' },
        { tenantId, planCode: 'starter', status: 'suspended', maxUsers: null },
        platform().deps,
      ),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(await createEntitlementsFor(getDbAdmin()).isReadOnly(tenantId)).toBe(false);
  });
});

describe('inviteTenantAdmin', () => {
  it('reinvitar el mismo correo renueva la invitación; un correo nuevo crea otra', async () => {
    const { tenantId, invitationId, input } = await create();
    const p = platform();

    const renewed = await inviteTenantAdmin(ctx, { tenantId, email: input.adminEmail }, p.deps);
    expect(renewed.invitationId).toBe(invitationId);

    const other = await inviteTenantAdmin(ctx, { tenantId, email: randomEmail() }, p.deps);
    expect(other.invitationId).not.toBe(invitationId);

    const actions = await getDbAdmin()
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId));
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['invitation.renewed', 'invitation.created']),
    );
  });

  it('cupo lleno → tenant_seats_full', async () => {
    const { tenantId } = await create(newTenantInput({ maxUsers: 1 }));
    const error = await errorOf(
      inviteTenantAdmin(ctx, { tenantId, email: randomEmail() }, platform().deps),
    );
    expect(error.reason).toBe('tenant_seats_full');
  });
});

describe('lecturas', () => {
  it('lista y detalle cuentan miembros e invitaciones de cada cliente sin mezclarlos', async () => {
    const a = await create(newTenantInput({ maxUsers: 9 }));
    const b = await create();
    const member = await fx.user();
    await fx.membership(a.tenantId, member.id, { roles: ['requester'] });
    const disabled = await fx.user();
    await fx.membership(a.tenantId, disabled.id, { status: 'disabled' });

    const store = createPlatformStore([], getDbAdmin());
    const list = await listTenants(ctx, { store });
    const rowA = list.find((t) => t.tenantId === a.tenantId);
    const rowB = list.find((t) => t.tenantId === b.tenantId);
    expect(rowA).toMatchObject({
      activeMembers: 1,
      liveInvitations: 1,
      subscription: { planCode: 'starter', status: 'active', userLimit: 9 },
    });
    expect(rowB).toMatchObject({ activeMembers: 0, liveInvitations: 1 });

    const detail = await getTenant(
      ctx,
      { tenantId: a.tenantId },
      { store, clock: new FixedClock(new Date()) },
    );
    expect(detail).toMatchObject({
      currency: 'USD',
      activeMembers: 1,
      subscription: { maxUsersOverride: 9 },
      invitations: [expect.objectContaining({ email: a.input.adminEmail, expired: false })],
    });
    expect(
      await getTenant(ctx, { tenantId: randomUUID() }, { store, clock: new FixedClock() }),
    ).toBeNull();
  });
});

describe('bootstrapPlatformAdmin', () => {
  it('crea cuenta, usuario y SuperAdmin; la segunda vez no cambia nada', async () => {
    const email = randomEmail();
    fx.trackUserEmail(email);
    const authUserId = randomUUID();
    const createUser = vi.fn(() => Promise.resolve({ ok: true as const, authUserId }));
    const authAdmin: AuthAdmin = { createUser, deleteUser: vi.fn(() => Promise.resolve()) };
    const deps = { store: createPlatformStore([], getDbAdmin()), authAdmin };
    const input = { email, password: 'x'.repeat(12), fullName: 'SuperAdmin' };

    expect(await bootstrapPlatformAdmin(input, deps)).toBe('created');
    expect(await bootstrapPlatformAdmin(input, deps)).toBe('unchanged');
    expect(createUser).toHaveBeenCalledTimes(1);

    const [user] = await getDbAdmin().select().from(users).where(eq(users.email, email));
    expect(user?.authUserId).toBe(authUserId);
    const admins = await getDbAdmin()
      .select()
      .from(platformAdmins)
      .where(inArray(platformAdmins.userId, [user!.id]));
    expect(admins).toHaveLength(1);
    const [event] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.entityId, user!.id), eq(auditEvents.action, 'platform_admin.granted')),
      );
    expect(event).toMatchObject({ tenantId: null, actorType: 'system' });
    // El cleanup de fixtures borra audit_events por actor o tenant: este no tiene ninguno.
    await getDbAdmin().delete(auditEvents).where(eq(auditEvents.entityId, user!.id));
  });

  it('usuario existente: solo lo hace SuperAdmin, sin crear cuenta en Auth', async () => {
    const existing = await fx.user();
    const createUser = vi.fn(() =>
      Promise.resolve({ ok: true as const, authUserId: randomUUID() }),
    );
    const authAdmin: AuthAdmin = { createUser, deleteUser: vi.fn(() => Promise.resolve()) };
    const result = await bootstrapPlatformAdmin(
      { email: existing.email, password: 'x'.repeat(12), fullName: 'X' },
      { store: createPlatformStore([], getDbAdmin()), authAdmin },
    );
    expect(result).toBe('granted');
    expect(createUser).not.toHaveBeenCalled();
    await getDbAdmin().delete(auditEvents).where(eq(auditEvents.entityId, existing.id));
  });
});
