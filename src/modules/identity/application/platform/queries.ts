// Lecturas de la consola (E1-H4): lista de clientes, detalle y planes. La página ya exigió
// SuperAdmin (requirePlatformAdmin); las lecturas no se auditan (ADR-004 §8).
import type { PlatformCtx } from '@/shared/context';

import {
  effectiveLimits,
  planOverridesSchema,
  type SubscriptionStatus,
} from '../../domain/entitlements';

import type { PlatformStore, SubscriptionRecord } from './ports';

export interface TenantSubscriptionView {
  readonly planCode: string;
  readonly planName: string;
  readonly status: SubscriptionStatus;
  /** Límite efectivo (plan + override); null = ilimitado. */
  readonly userLimit: number | null;
  /** Override de max_users; undefined = el del plan. */
  readonly maxUsersOverride: number | null | undefined;
}

export interface TenantListItem {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  /** Vigente, o null ("Sin suscripción"). */
  readonly subscription: TenantSubscriptionView | null;
  readonly activeMembers: number;
  readonly liveInvitations: number;
}

export interface TenantDetail extends Omit<TenantListItem, 'subscription'> {
  readonly currency: 'PEN' | 'USD';
  readonly timezone: string;
  readonly createdAt: Date;
  /** La vigente o la última cancelada. */
  readonly subscription: TenantSubscriptionView | null;
  readonly invitations: readonly {
    readonly invitationId: string;
    readonly email: string;
    readonly expiresAt: Date;
    readonly expired: boolean;
  }[];
}

export interface PlanOption {
  readonly code: string;
  readonly name: string;
  readonly maxUsers: number | null;
}

function toView(record: SubscriptionRecord): TenantSubscriptionView {
  const overrides = planOverridesSchema.parse(record.overrides ?? {});
  return {
    planCode: record.planCode,
    planName: record.planName,
    status: record.status,
    userLimit: effectiveLimits(record.planLimits, overrides).maxUsers,
    maxUsersOverride: overrides.max_users,
  };
}

export async function listTenants(
  _ctx: PlatformCtx,
  deps: { store: PlatformStore },
): Promise<TenantListItem[]> {
  const rows = await deps.store.listTenants();
  return rows.map((row) => ({
    ...row,
    subscription: row.subscription ? toView(row.subscription) : null,
  }));
}

export async function getTenant(
  _ctx: PlatformCtx,
  input: { tenantId: string },
  deps: { store: PlatformStore; clock: { now(): Date } },
): Promise<TenantDetail | null> {
  const now = deps.clock.now();
  const row = await deps.store.getTenant(input.tenantId, now);
  if (!row) return null;
  return {
    ...row,
    subscription: row.subscription ? toView(row.subscription) : null,
    invitations: row.invitations.map((invitation) => ({
      ...invitation,
      expired: invitation.expiresAt.getTime() <= now.getTime(),
    })),
  };
}

export async function listPlans(
  _ctx: PlatformCtx,
  deps: { store: PlatformStore },
): Promise<PlanOption[]> {
  const plans = await deps.store.listPlans();
  return plans
    .filter((plan) => plan.active)
    .map(({ code, name, maxUsers }) => ({ code, name, maxUsers }));
}
