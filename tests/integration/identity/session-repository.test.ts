// E1-H2 · CtxResolver real: users.id y membresías a partir de auth_user_id con una lectura acotada
// con getDbAdmin() (ADR-004 §8). El ctx se reconstruye validando membresía activa y estado del
// tenant; aislamiento entre dos tenants; Entitlements.isReadOnly vía loadStatus.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { createSessionServices, permissionsFor, resolveTenantSession } from '@/modules/identity';

import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const services = () => createSessionServices(getDbAdmin());

// Tenants: A (activo, con settings America/Bogota), B (activo, sin settings), S (suspendido),
// N (activo sin suscripción), P (suscripción suspendida). Los nombres fijan el orden alfabético.
let A: string;
let B: string;
let S: string;
let N: string;
let P: string;

const auth = {
  onlyA: randomUUID(),
  multi: randomUUID(),
  disabledUser: randomUUID(),
  disabledMembership: randomUUID(),
  admin: randomUUID(),
  adminDisabled: randomUUID(),
  unknown: randomUUID(),
};
let onlyAUserId: string;

beforeAll(async () => {
  const tag = randomUUID().slice(0, 8);
  A = (await fx.tenant({ name: `zz-${tag} Alfa` })).id;
  B = (await fx.tenant({ name: `zz-${tag} Beta` })).id;
  S = (await fx.tenant({ name: `zz-${tag} Suspendida`, status: 'suspended' })).id;
  N = (await fx.tenant({ name: `zz-${tag} Nula` })).id;
  P = (await fx.tenant({ name: `zz-${tag} Pausada` })).id;
  await fx.settings(A, { timezone: 'America/Bogota' });
  await fx.subscription(A, 'starter');
  await fx.subscription(B, 'starter');
  await fx.subscription(S, 'starter');
  await fx.subscription(P, 'starter', { status: 'suspended' });

  const onlyA = await fx.user({ authUserId: auth.onlyA });
  onlyAUserId = onlyA.id;
  await fx.membership(A, onlyA.id, { roles: ['requester', 'approver'] });

  const multi = await fx.user({ authUserId: auth.multi });
  // Insertadas fuera de orden: findEntryAccess las ordena por nombre.
  await fx.membership(S, multi.id);
  await fx.membership(B, multi.id, { roles: ['admin'] });
  await fx.membership(A, multi.id);
  await fx.membership(N, multi.id, { status: 'disabled' });

  const disabledUser = await fx.user({ authUserId: auth.disabledUser, status: 'disabled' });
  await fx.membership(A, disabledUser.id);

  const disabledMembership = await fx.user({ authUserId: auth.disabledMembership });
  await fx.membership(A, disabledMembership.id, { status: 'disabled' });

  const admin = await fx.user({ authUserId: auth.admin });
  await fx.platformAdmin(admin.id);

  const adminDisabled = await fx.user({ authUserId: auth.adminDisabled, status: 'disabled' });
  await fx.platformAdmin(adminDisabled.id);

  // Un usuario sin auth_user_id no debe coincidir con nada.
  await fx.user();
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('SessionRepository.findTenantAccess', () => {
  it('usuario y membresía activos → userId, roles y zona horaria del tenant', async () => {
    const access = await services().sessions.findTenantAccess(auth.onlyA, A);

    expect(access).toEqual({
      userId: onlyAUserId,
      email: expect.any(String) as unknown,
      roles: ['requester', 'approver'],
      timezone: 'America/Bogota',
      locale: 'es-PE',
    });
  });

  it('sin tenant_settings la zona horaria por defecto es America/Lima', async () => {
    const access = await services().sessions.findTenantAccess(auth.multi, B);

    expect(access?.timezone).toBe('America/Lima');
    expect(access?.roles).toEqual(['admin']);
  });

  it.each([
    ['usuario desactivado', () => auth.disabledUser, () => A],
    ['membresía desactivada', () => auth.disabledMembership, () => A],
    ['authUserId desconocido', () => auth.unknown, () => A],
    ['membresía desactivada en N (otra activa en A)', () => auth.multi, () => N],
    ['tenant inexistente', () => auth.onlyA, () => randomUUID()],
  ])('%s → null', async (_label, authUserId, tenantId) => {
    expect(await services().sessions.findTenantAccess(authUserId(), tenantId())).toBeNull();
  });

  it('aislamiento entre dos tenants: usuario solo en A pidiendo el tenant B → null', async () => {
    expect(await services().sessions.findTenantAccess(auth.onlyA, B)).toBeNull();
    expect(await services().sessions.findTenantAccess(auth.onlyA, A)).not.toBeNull();
  });
});

describe('SessionRepository.findEntryAccess', () => {
  it('solo lista membresías activas, ordenadas por nombre de empresa (incluye la suspendida)', async () => {
    const access = await services().sessions.findEntryAccess(auth.multi);

    expect(access.user).not.toBeNull();
    expect(access.memberships.map((m) => m.tenantId)).toEqual([A, B, S]);
    expect(access.memberships[0]?.tenantName).toMatch(/Alfa$/);
    expect(access.isPlatformAdmin).toBe(false);
  });

  it('una membresía: el usuario solo ve su empresa (aislamiento)', async () => {
    const access = await services().sessions.findEntryAccess(auth.onlyA);

    expect(access.memberships.map((m) => m.tenantId)).toEqual([A]);
  });

  it('SuperAdmin sin membresías → isPlatformAdmin true y sin membresías', async () => {
    expect(await services().sessions.findEntryAccess(auth.admin)).toEqual({
      user: { id: expect.any(String) as unknown, email: expect.any(String) as unknown },
      memberships: [],
      isPlatformAdmin: true,
    });
  });

  it.each([
    ['usuario desactivado', () => auth.disabledUser],
    ['SuperAdmin desactivado', () => auth.adminDisabled],
    ['authUserId desconocido', () => auth.unknown],
  ])('%s → user null, sin membresías ni SuperAdmin', async (_label, authUserId) => {
    expect(await services().sessions.findEntryAccess(authUserId())).toEqual({
      user: null,
      memberships: [],
      isPlatformAdmin: false,
    });
  });

  it('membresía desactivada → user presente y sin membresías', async () => {
    const access = await services().sessions.findEntryAccess(auth.disabledMembership);

    expect(access.user).not.toBeNull();
    expect(access.memberships).toEqual([]);
  });
});

describe('resolveTenantSession con createSessionServices(getDbAdmin())', () => {
  it('el ctx se reconstruye con permisos, zona horaria y readOnly false en un tenant activo', async () => {
    const ctx = await resolveTenantSession(
      { authUserId: auth.onlyA, tenantId: A, requestId: 'req-int-1' },
      services(),
    );

    expect(ctx).toEqual({
      tenantId: A,
      userId: onlyAUserId,
      roles: ['requester', 'approver'],
      permissions: permissionsFor(['requester', 'approver']),
      locale: 'es-PE',
      timezone: 'America/Bogota',
      requestId: 'req-int-1',
      readOnly: false,
    });
  });

  it('tenant suspendido → entra con readOnly true', async () => {
    const ctx = await resolveTenantSession(
      { authUserId: auth.multi, tenantId: S, requestId: 'req-int-2' },
      services(),
    );

    expect(ctx?.tenantId).toBe(S);
    expect(ctx?.readOnly).toBe(true);
  });

  it('aislamiento: una cookie con el tenant B para un usuario que solo pertenece a A → null', async () => {
    const ctx = await resolveTenantSession(
      { authUserId: auth.onlyA, tenantId: B, requestId: 'req-int-3' },
      services(),
    );

    expect(ctx).toBeNull();
  });

  it('membresía desactivada → null', async () => {
    const ctx = await resolveTenantSession(
      { authUserId: auth.multi, tenantId: N, requestId: 'req-int-4' },
      services(),
    );

    expect(ctx).toBeNull();
  });
});

describe('Entitlements.isReadOnly vía loadStatus', () => {
  it.each([
    ['tenant activo con suscripción activa', () => A, false],
    ['tenant suspendido', () => S, true],
    ['sin suscripción', () => N, true],
    ['suscripción suspendida', () => P, true],
  ])('%s → %s', async (_label, tenantId, expected) => {
    expect(await services().entitlements.isReadOnly(tenantId())).toBe(expected);
  });

  it('tenant inexistente → lanza (el resolver lo trata como solo lectura)', async () => {
    await expect(services().entitlements.isReadOnly(randomUUID())).rejects.toThrow();
  });
});
