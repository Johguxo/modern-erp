// Reglas de planes y límites (ADR-002 §3), como funciones puras sobre una "foto" del tenant.
// El servicio (application/entitlements.ts) carga la foto con el repositorio.
import { z } from 'zod';

import { PLAN_FEATURES, type PlanFeature } from './plan-features';

export type TenantStatus = 'active' | 'suspended' | 'cancelled';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface PlanLimits {
  /** null = ilimitado */
  readonly maxUsers: number | null;
  readonly maxWarehouses: number | null;
  readonly storageMb: number;
  readonly features: readonly PlanFeature[];
}

const limit = z.number().int().positive().nullable();

/** `subscriptions.overrides`: ajustes por cliente. Las claves desconocidas se ignoran. */
export const planOverridesSchema = z.object({
  max_users: limit.optional(),
  max_warehouses: limit.optional(),
  storage_mb: z.number().int().positive().optional(),
  /** Reemplaza la lista del plan. */
  features: z.array(z.enum(PLAN_FEATURES)).optional(),
});
export type PlanOverrides = z.infer<typeof planOverridesSchema>;

export interface EntitlementSnapshot {
  readonly tenantStatus: TenantStatus;
  /** Suscripción vigente (no cancelada), o null si no hay. */
  readonly subscription: {
    readonly status: SubscriptionStatus;
    readonly plan: PlanLimits;
    /** jsonb tal cual viene de la base; se valida aquí. */
    readonly overrides: unknown;
  } | null;
  /** Membresías activas + invitaciones pendientes no vencidas. */
  readonly seatsUsed: number;
}

export function effectiveLimits(plan: PlanLimits, rawOverrides: unknown): PlanLimits {
  // Un jsonb inválido es un bug de datos: que falle fuerte (termina en 500 + log).
  const overrides = planOverridesSchema.parse(rawOverrides ?? {});
  return {
    maxUsers: overrides.max_users !== undefined ? overrides.max_users : plan.maxUsers,
    maxWarehouses:
      overrides.max_warehouses !== undefined ? overrides.max_warehouses : plan.maxWarehouses,
    storageMb: overrides.storage_mb ?? plan.storageMb,
    features: overrides.features ?? plan.features,
  };
}

const BLOCKING_TENANT: readonly TenantStatus[] = ['suspended', 'cancelled'];
const BLOCKING_SUBSCRIPTION: readonly SubscriptionStatus[] = ['suspended', 'cancelled'];

/** Cliente suspendido o cancelado, o sin suscripción vigente: solo lectura. */
export function isReadOnly(snapshot: EntitlementSnapshot): boolean {
  if (BLOCKING_TENANT.includes(snapshot.tenantStatus)) return true;
  if (!snapshot.subscription) return true;
  return BLOCKING_SUBSCRIPTION.includes(snapshot.subscription.status);
}

export interface UserCapacity {
  readonly allowed: boolean;
  /** null = ilimitado */
  readonly limit: number | null;
  readonly used: number;
}

export function userCapacity(snapshot: EntitlementSnapshot): UserCapacity {
  if (!snapshot.subscription || isReadOnly(snapshot)) {
    return { allowed: false, limit: null, used: snapshot.seatsUsed };
  }
  const { maxUsers } = effectiveLimits(snapshot.subscription.plan, snapshot.subscription.overrides);
  return {
    allowed: maxUsers === null || snapshot.seatsUsed < maxUsers,
    limit: maxUsers,
    used: snapshot.seatsUsed,
  };
}

export function hasFeature(snapshot: EntitlementSnapshot, feature: PlanFeature): boolean {
  if (!snapshot.subscription) return false;
  const { features } = effectiveLimits(snapshot.subscription.plan, snapshot.subscription.overrides);
  return features.includes(feature);
}
