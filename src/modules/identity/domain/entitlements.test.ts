// E1-H1 · Reglas de planes y límites (ADR-002 §3) como funciones puras.
import { describe, expect, it } from 'vitest';

import {
  effectiveLimits,
  hasFeature,
  isReadOnly,
  userCapacity,
  type EntitlementSnapshot,
  type PlanLimits,
  type SubscriptionStatus,
  type TenantStatus,
} from './entitlements';

const STARTER: PlanLimits = { maxUsers: 10, maxWarehouses: 1, storageMb: 1024, features: ['sof'] };
const ENTERPRISE: PlanLimits = {
  maxUsers: null,
  maxWarehouses: null,
  storageMb: 20480,
  features: ['sof', 'dashboard', 'microsoft_login', 'external_approvals'],
};

function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    tenantStatus: 'active',
    subscription: { status: 'active', plan: STARTER, overrides: {} },
    seatsUsed: 0,
    ...overrides,
  };
}

function withSubscription(
  status: SubscriptionStatus,
  plan: PlanLimits = STARTER,
  overrides: unknown = {},
  rest: Partial<EntitlementSnapshot> = {},
): EntitlementSnapshot {
  return snapshot({ subscription: { status, plan, overrides }, ...rest });
}

describe('effectiveLimits: límites del plan con los overrides de la suscripción', () => {
  it('sin overrides devuelve los del plan', () => {
    expect(effectiveLimits(STARTER, {})).toEqual(STARTER);
  });

  it('overrides null o undefined equivalen a {}', () => {
    expect(effectiveLimits(STARTER, null)).toEqual(STARTER);
    expect(effectiveLimits(STARTER, undefined)).toEqual(STARTER);
  });

  it('max_users numérico reemplaza el del plan', () => {
    expect(effectiveLimits(STARTER, { max_users: 40 }).maxUsers).toBe(40);
  });

  it('max_users null significa ilimitado aunque el plan tenga límite', () => {
    expect(effectiveLimits(STARTER, { max_users: null }).maxUsers).toBeNull();
  });

  it('max_warehouses se puede sobrescribir y poner ilimitado', () => {
    expect(effectiveLimits(STARTER, { max_warehouses: 5 }).maxWarehouses).toBe(5);
    expect(effectiveLimits(STARTER, { max_warehouses: null }).maxWarehouses).toBeNull();
  });

  it('storage_mb reemplaza el del plan', () => {
    expect(effectiveLimits(STARTER, { storage_mb: 4096 }).storageMb).toBe(4096);
  });

  it('features reemplaza (no suma) la lista del plan', () => {
    expect(effectiveLimits(ENTERPRISE, { features: ['sof'] }).features).toEqual(['sof']);
    expect(effectiveLimits(STARTER, { features: [] }).features).toEqual([]);
  });

  it('un override no toca los demás límites', () => {
    const result = effectiveLimits(STARTER, { max_users: 40 });
    expect(result).toEqual({ ...STARTER, maxUsers: 40 });
  });

  it('ignora claves desconocidas', () => {
    expect(effectiveLimits(STARTER, { color: 'red' })).toEqual(STARTER);
  });

  it.each([
    ['max_users negativo', { max_users: -1 }],
    ['max_users cero', { max_users: 0 }],
    ['max_users decimal', { max_users: 1.5 }],
    ['max_users texto', { max_users: '40' }],
    ['storage_mb null', { storage_mb: null }],
    ['feature desconocida', { features: ['teleport'] }],
    ['overrides no es objeto', 'max_users=40'],
  ])('overrides inválidos lanzan: %s', (_name, overrides) => {
    expect(() => effectiveLimits(STARTER, overrides)).toThrow();
  });
});

describe('isReadOnly: matriz estado del tenant × estado de la suscripción', () => {
  const SUBSCRIPTION_STATUSES: (SubscriptionStatus | null)[] = [
    'trial',
    'active',
    'past_due',
    'suspended',
    'cancelled',
    null,
  ];
  const TENANT_STATUSES: TenantStatus[] = ['active', 'suspended', 'cancelled'];
  const writable = new Set<SubscriptionStatus | null>(['trial', 'active', 'past_due']);

  const cases = TENANT_STATUSES.flatMap((tenant) =>
    SUBSCRIPTION_STATUSES.map((sub) => ({
      tenant,
      sub,
      expected: tenant !== 'active' || !writable.has(sub),
    })),
  );

  it.each(cases)(
    'tenant $tenant + suscripción $sub → solo lectura = $expected',
    ({ tenant, sub, expected }) => {
      const snap = snapshot({
        tenantStatus: tenant,
        subscription: sub === null ? null : { status: sub, plan: STARTER, overrides: {} },
      });

      expect(isReadOnly(snap)).toBe(expected);
    },
  );
});

describe('userCapacity: si se puede agregar un usuario', () => {
  it('bajo el límite: permitido, con límite y uso', () => {
    expect(userCapacity(withSubscription('active', STARTER, {}, { seatsUsed: 9 }))).toEqual({
      allowed: true,
      limit: 10,
      used: 9,
    });
  });

  it('en el límite: no permitido', () => {
    expect(userCapacity(withSubscription('active', STARTER, {}, { seatsUsed: 10 }))).toEqual({
      allowed: false,
      limit: 10,
      used: 10,
      reason: 'limit_reached',
    });
  });

  it('sobre el límite: no permitido', () => {
    expect(userCapacity(withSubscription('active', STARTER, {}, { seatsUsed: 12 })).allowed).toBe(
      false,
    );
  });

  it('plan ilimitado: permitido con limit null', () => {
    expect(userCapacity(withSubscription('active', ENTERPRISE, {}, { seatsUsed: 500 }))).toEqual({
      allowed: true,
      limit: null,
      used: 500,
    });
  });

  it('respeta el override de max_users', () => {
    const snap = withSubscription('active', STARTER, { max_users: 40 }, { seatsUsed: 10 });
    expect(userCapacity(snap)).toEqual({ allowed: true, limit: 40, used: 10 });
  });

  it('override max_users null en un plan con límite: ilimitado', () => {
    const snap = withSubscription('active', STARTER, { max_users: null }, { seatsUsed: 10 });
    expect(userCapacity(snap)).toEqual({ allowed: true, limit: null, used: 10 });
  });

  it('trial y past_due no bloquean', () => {
    expect(userCapacity(withSubscription('trial', STARTER, {}, { seatsUsed: 1 })).allowed).toBe(
      true,
    );
    expect(userCapacity(withSubscription('past_due', STARTER, {}, { seatsUsed: 1 })).allowed).toBe(
      true,
    );
  });

  it('sin suscripción: no permitido', () => {
    expect(userCapacity(snapshot({ subscription: null, seatsUsed: 2 }))).toEqual({
      allowed: false,
      limit: null,
      used: 2,
      reason: 'no_subscription',
    });
  });

  it('solo lectura (suscripción suspendida): no permitido aunque haya cupo', () => {
    expect(userCapacity(withSubscription('suspended', ENTERPRISE)).allowed).toBe(false);
  });

  it('solo lectura (tenant suspendido): no permitido aunque haya cupo', () => {
    const snap = withSubscription('active', ENTERPRISE, {}, { tenantStatus: 'suspended' });
    expect(userCapacity(snap).allowed).toBe(false);
  });
});

describe('hasFeature', () => {
  it('true si el plan la incluye', () => {
    expect(hasFeature(withSubscription('active', STARTER), 'sof')).toBe(true);
  });

  it('false si el plan no la incluye', () => {
    expect(hasFeature(withSubscription('active', STARTER), 'dashboard')).toBe(false);
  });

  it('el override de features reemplaza la lista del plan', () => {
    const snap = withSubscription('active', STARTER, { features: ['dashboard'] });
    expect(hasFeature(snap, 'dashboard')).toBe(true);
    expect(hasFeature(snap, 'sof')).toBe(false);
  });

  it('sin suscripción: false', () => {
    expect(hasFeature(snapshot({ subscription: null }), 'sof')).toBe(false);
  });
});
