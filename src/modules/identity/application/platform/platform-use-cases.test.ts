// E1-H4 · Casos de uso de la consola con fakes: alta de cliente, cambios de suscripción, invitar al
// admin del cliente y la revisión de SuperAdmin dentro de la transacción.
import { createInMemoryPlatform, PLATFORM_ADMIN_ID } from '@tests/support/fakes/in-memory-platform';
import { describe, expect, it } from 'vitest';

import type { PlatformCtx } from '@/shared/context';
import { isDomainError } from '@/shared/errors';

import { hashInvitationToken } from '../../domain/invitation';

import { createTenant } from './create-tenant';
import { inviteTenantAdmin } from './invite-tenant-admin';
import { updateSubscription } from './update-subscription';

const ctx: PlatformCtx = { userId: PLATFORM_ADMIN_ID, requestId: 'req-1' };
const outsider: PlatformCtx = { userId: 'not-an-admin', requestId: 'req-2' };

const newTenant = {
  name: 'Acme Perú',
  slug: 'acme',
  planCode: 'basic',
  maxUsers: null,
  currency: 'USD' as const,
  adminEmail: 'jefa@acme.pe',
};

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

describe('createTenant', () => {
  it('crea tenant, ajustes, suscripción activa, pasos de alta e invitación admin; audita y envía el correo tras el commit', async () => {
    const fake = createInMemoryPlatform();

    const result = await createTenant(ctx, newTenant, fake.deps);

    expect(fake.tenants).toEqual([
      { id: result.tenantId, name: 'Acme Perú', slug: 'acme', currency: 'USD' },
    ]);
    expect(fake.subscriptions).toEqual([
      expect.objectContaining({
        tenantId: result.tenantId,
        planId: 'plan-basic',
        status: 'active',
        overrides: {},
      }),
    ]);
    expect(fake.setupCalls).toEqual([result.tenantId]);
    expect(fake.invitations).toEqual([
      expect.objectContaining({
        id: result.invitationId,
        tenantId: result.tenantId,
        email: 'jefa@acme.pe',
        roles: ['admin'],
        invitedBy: PLATFORM_ADMIN_ID,
      }),
    ]);
    expect(fake.audit.map((a) => [a.action, a.actorType, a.actorUserId, a.tenantId])).toEqual([
      ['tenant.created', 'platform_admin', PLATFORM_ADMIN_ID, result.tenantId],
      ['invitation.created', 'platform_admin', PLATFORM_ADMIN_ID, result.tenantId],
    ]);

    expect(fake.sent).toHaveLength(0);
    expect(await fake.runAfterCommit()).toEqual({ emailSent: true });
    const url = String(fake.sent[0]?.data.url);
    const token = url.split('/invitacion/')[1] ?? '';
    expect(fake.invitations[0]?.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(fake.audit)).not.toContain(token);
  });

  it('guarda max_users como override', async () => {
    const fake = createInMemoryPlatform();
    await createTenant(ctx, { ...newTenant, maxUsers: 12 }, fake.deps);
    expect(fake.subscriptions[0]?.overrides).toEqual({ max_users: 12 });
  });

  it('slug reservado → VALIDATION en el campo slug, sin crear nada', async () => {
    const fake = createInMemoryPlatform();
    const error = await errorOf(createTenant(ctx, { ...newTenant, slug: 'admin' }, fake.deps));
    expect(error).toMatchObject({ code: 'VALIDATION', reason: 'slug_reserved' });
    expect(fake.tenants).toHaveLength(0);
  });

  it('plan inactivo o inexistente → plan_unavailable', async () => {
    const fake = createInMemoryPlatform();
    for (const planCode of ['old', 'nope']) {
      const error = await errorOf(createTenant(ctx, { ...newTenant, planCode }, fake.deps));
      expect(error.reason).toBe('plan_unavailable');
    }
    expect(fake.tenants).toHaveLength(0);
  });

  it('quien no está en platform_admins → FORBIDDEN, sin crear nada', async () => {
    const fake = createInMemoryPlatform();
    const error = await errorOf(createTenant(outsider, newTenant, fake.deps));
    expect(error.code).toBe('FORBIDDEN');
    expect(fake.tenants).toHaveLength(0);
    expect(fake.audit).toHaveLength(0);
  });
});

describe('updateSubscription', () => {
  it('cambia plan, estado y límite de la vigente; audita from/to bajo los bloqueos', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();

    const result = await updateSubscription(
      ctx,
      { tenantId, planCode: 'pro', status: 'suspended', maxUsers: 8 },
      fake.deps,
    );

    expect(result).toEqual({ changed: true });
    expect(fake.locks).toEqual([`seats:${tenantId}`, `tenant:${tenantId}`]);
    expect(fake.subscriptions).toHaveLength(1);
    expect(fake.subscriptions[0]).toMatchObject({
      planId: 'plan-pro',
      status: 'suspended',
      overrides: { max_users: 8 },
      endsAt: null,
    });
    expect(fake.audit).toEqual([
      expect.objectContaining({
        action: 'subscription.updated',
        actorType: 'platform_admin',
        tenantId,
        data: {
          from: { planCode: 'basic', status: 'active', overrides: {} },
          to: { planCode: 'pro', status: 'suspended', overrides: { max_users: 8 } },
        },
      }),
    ]);
  });

  it('sin cambios → changed false y sin auditoría', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();
    const result = await updateSubscription(
      ctx,
      { tenantId, planCode: 'basic', status: 'active', maxUsers: null },
      fake.deps,
    );
    expect(result).toEqual({ changed: false });
    expect(fake.audit).toHaveLength(0);
  });

  it('cancelar fija ends_at; reactivar crea otra fila', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();
    const base = { tenantId, planCode: 'basic', maxUsers: null };

    await updateSubscription(ctx, { ...base, status: 'cancelled' }, fake.deps);
    expect(fake.subscriptions[0]?.endsAt).toEqual(fake.clock.now());

    await updateSubscription(ctx, { ...base, status: 'active' }, fake.deps);
    expect(fake.subscriptions.map((s) => s.status)).toEqual(['cancelled', 'active']);
    expect(fake.audit.map((a) => a.action)).toEqual([
      'subscription.updated',
      'subscription.created',
    ]);
  });

  it('tenant inexistente → NOT_FOUND; no SuperAdmin → FORBIDDEN', async () => {
    const fake = createInMemoryPlatform();
    const input = {
      tenantId: 'missing',
      planCode: 'basic',
      status: 'active' as const,
      maxUsers: null,
    };
    expect((await errorOf(updateSubscription(ctx, input, fake.deps))).code).toBe('NOT_FOUND');
    expect((await errorOf(updateSubscription(outsider, input, fake.deps))).code).toBe('FORBIDDEN');
  });

  it('plan retirado solo si ya es el suyo', async () => {
    const fake = createInMemoryPlatform();
    const legacy = fake.addTenant({ planCode: 'old' });
    const other = fake.addTenant();
    const keep = { planCode: 'old', status: 'past_due' as const, maxUsers: null };

    await expect(
      updateSubscription(ctx, { tenantId: legacy, ...keep }, fake.deps),
    ).resolves.toEqual({
      changed: true,
    });
    expect(
      (await errorOf(updateSubscription(ctx, { tenantId: other, ...keep }, fake.deps))).reason,
    ).toBe('plan_unavailable');
  });
});

describe('inviteTenantAdmin', () => {
  it('crea una invitación admin y revisa el cupo', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();

    const result = await inviteTenantAdmin(ctx, { tenantId, email: 'otro@acme.pe' }, fake.deps);

    expect(fake.capacityCalls).toEqual([tenantId]);
    expect(fake.invitations[0]).toMatchObject({ id: result.invitationId, roles: ['admin'] });
    expect(fake.audit[0]).toMatchObject({
      action: 'invitation.created',
      actorType: 'platform_admin',
    });
  });

  it('el mismo correo pendiente se renueva (sin revisar cupo si está vigente)', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();
    const existing = fake.addInvitation(tenantId, { email: 'jefa@acme.pe' });

    const result = await inviteTenantAdmin(ctx, { tenantId, email: 'jefa@acme.pe' }, fake.deps);

    expect(result.invitationId).toBe(existing.id);
    expect(fake.capacityCalls).toHaveLength(0);
    expect(fake.invitations[0]?.tokenHash).not.toBe('old-hash');
    expect(fake.audit[0]).toMatchObject({
      action: 'invitation.renewed',
      // Pasa a admin: queda el rastro de los roles que tenía.
      data: { email: 'jefa@acme.pe', from: { roles: ['requester'] }, to: { roles: ['admin'] } },
    });
    expect(fake.invitations[0]?.roles).toEqual(['admin']);
  });

  it('cupo lleno → tenant_seats_full; solo lectura → tenant_inactive', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();
    const input = { tenantId, email: 'x@acme.pe' };

    fake.setCapacity({ allowed: false, limit: 5, used: 5, reason: 'limit_reached' });
    expect((await errorOf(inviteTenantAdmin(ctx, input, fake.deps))).reason).toBe(
      'tenant_seats_full',
    );
    fake.setCapacity({ allowed: false, limit: 5, used: 1, reason: 'read_only' });
    expect((await errorOf(inviteTenantAdmin(ctx, input, fake.deps))).reason).toBe(
      'tenant_inactive',
    );
  });

  it('miembro activo → already_member', async () => {
    const fake = createInMemoryPlatform();
    const tenantId = fake.addTenant();
    fake.addMember(tenantId, { userId: 'u1', email: 'jefa@acme.pe', roles: ['admin'] });
    const error = await errorOf(
      inviteTenantAdmin(ctx, { tenantId, email: 'jefa@acme.pe' }, fake.deps),
    );
    expect(error.reason).toBe('already_member');
  });
});
