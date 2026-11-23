// E1-H1 · Repositorio Drizzle de Entitlements: mismo resultado con getDbAdmin() y dentro de
// withTenant; cuenta asientos (membresías activas + invitaciones pendientes no vencidas) sin datos
// de otro tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { withTenant } from '@/db/with-tenant';
import { createEntitlementsFor } from '@/modules/identity';
import { NotFoundError } from '@/shared/errors';

import { newId } from '../helpers/db';
import { createIdentityFixtures, FAR_FUTURE, FAR_PAST } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const ACCEPTED_AT = new Date('2026-01-15T15:00:00.000Z');

let A: string;
let B: string;
let U: string;

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  U = (await fx.user()).id;
  const active2 = await fx.user();
  const disabled = await fx.user();

  // A: starter (10 usuarios). Asientos = 2 activos + 1 invitación pendiente vigente = 3.
  await fx.subscription(A, 'starter', { status: 'active' });
  await fx.membership(A, U, { roles: ['admin'] });
  await fx.membership(A, active2.id);
  await fx.membership(A, disabled.id, { status: 'disabled' });
  await fx.invitation(A, { expiresAt: FAR_FUTURE });
  await fx.invitation(A, { expiresAt: FAR_PAST });
  await fx.invitation(A, { expiresAt: FAR_FUTURE, acceptedAt: ACCEPTED_AT });

  // B: datos que no deben contarse para A.
  await fx.subscription(B, 'enterprise', { status: 'active' });
  for (let i = 0; i < 4; i += 1) await fx.membership(B, (await fx.user()).id);
  await fx.membership(B, U);
  await fx.invitation(B, { expiresAt: FAR_FUTURE });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('createEntitlementsFor con getDbAdmin() y con withTenant', () => {
  it('canAddUser de A cuenta activas + invitaciones pendientes no vencidas (3), sin desactivados, vencidas, aceptadas ni datos de B', async () => {
    await expect(createEntitlementsFor(getDbAdmin()).canAddUser(A)).resolves.toEqual({
      allowed: true,
      limit: 10,
      used: 3,
    });
  });

  it('dentro de withTenant(A) devuelve lo mismo que con getDbAdmin()', async () => {
    const admin = createEntitlementsFor(getDbAdmin());
    const fromAdmin = {
      capacity: await admin.canAddUser(A),
      readOnly: await admin.isReadOnly(A),
      sof: await admin.hasFeature(A, 'sof'),
      dashboard: await admin.hasFeature(A, 'dashboard'),
    };

    const fromTenant = await withTenant({ tenantId: A, userId: U }, async (tx) => {
      const e = createEntitlementsFor(tx);
      return {
        capacity: await e.canAddUser(A),
        readOnly: await e.isReadOnly(A),
        sof: await e.hasFeature(A, 'sof'),
        dashboard: await e.hasFeature(A, 'dashboard'),
      };
    });

    expect(fromTenant).toEqual(fromAdmin);
    expect(fromAdmin).toEqual({
      capacity: { allowed: true, limit: 10, used: 3 },
      readOnly: false,
      sof: true,
      dashboard: false,
    });
  });

  it('B (enterprise) es ilimitado y cuenta solo lo suyo (5 activas + 1 pendiente)', async () => {
    await expect(createEntitlementsFor(getDbAdmin()).canAddUser(B)).resolves.toEqual({
      allowed: true,
      limit: null,
      used: 6,
    });
  });

  it('respeta el override max_users de la suscripción (en el límite → no permitido)', async () => {
    const tenant = (await fx.tenant()).id;
    await fx.subscription(tenant, 'business', {
      overrides: { max_users: 2, features: ['sof', 'whatsapp'] },
    });
    await fx.membership(tenant, (await fx.user()).id);
    await fx.invitation(tenant);
    const e = createEntitlementsFor(getDbAdmin());

    await expect(e.canAddUser(tenant)).resolves.toEqual({ allowed: false, limit: 2, used: 2 });
    await expect(e.hasFeature(tenant, 'whatsapp')).resolves.toBe(true);
    await expect(e.hasFeature(tenant, 'dashboard')).resolves.toBe(false);
  });

  it('usa la suscripción vigente e ignora las canceladas', async () => {
    const tenant = (await fx.tenant()).id;
    await fx.subscription(tenant, 'enterprise', { status: 'cancelled' });
    await fx.subscription(tenant, 'starter', { status: 'trial' });

    await expect(createEntitlementsFor(getDbAdmin()).canAddUser(tenant)).resolves.toEqual({
      allowed: true,
      limit: 10,
      used: 0,
    });
  });

  it('tenant suspendido → isReadOnly true', async () => {
    const tenant = (await fx.tenant({ status: 'suspended' })).id;
    await fx.subscription(tenant, 'starter', { status: 'active' });

    await expect(createEntitlementsFor(getDbAdmin()).isReadOnly(tenant)).resolves.toBe(true);
  });

  it('tenant sin suscripción vigente → isReadOnly true y canAddUser no permitido', async () => {
    const tenant = (await fx.tenant()).id;
    await fx.subscription(tenant, 'starter', { status: 'cancelled' });
    const e = createEntitlementsFor(getDbAdmin());

    await expect(e.isReadOnly(tenant)).resolves.toBe(true);
    await expect(e.canAddUser(tenant)).resolves.toMatchObject({ allowed: false });
  });

  it('tenant inexistente → NotFoundError', async () => {
    await expect(createEntitlementsFor(getDbAdmin()).canAddUser(newId())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('dentro de withTenant(A), pedir B → NotFoundError (RLS lo oculta)', async () => {
    await expect(
      withTenant({ tenantId: A, userId: U }, (tx) => createEntitlementsFor(tx).isReadOnly(B)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
