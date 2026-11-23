// Repositorio de Entitlements. Funciona con la transacción de withTenant (RLS) o con getDbAdmin()
// (resolver de sesión); en ambos casos filtra por tenantId de forma explícita (primera defensa).
import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { invitations, memberships, plans, subscriptions, tenants } from '@/db/schema';
import { NotFoundError } from '@/shared/errors';

import type { EntitlementsRepository } from '../application/ports';
import type { EntitlementSnapshot, SubscriptionStatus, TenantStatus } from '../domain/entitlements';
import { PLAN_FEATURES, type PlanFeature } from '../domain/plan-features';

function toFeatures(values: readonly string[]): PlanFeature[] {
  return values.filter((value): value is PlanFeature =>
    (PLAN_FEATURES as readonly string[]).includes(value),
  );
}

export function createDrizzleEntitlementsRepository(db: DbExecutor): EntitlementsRepository {
  return {
    async loadSnapshot(tenantId: string): Promise<EntitlementSnapshot> {
      const [row] = await db
        .select({
          tenantStatus: tenants.status,
          subscriptionStatus: subscriptions.status,
          overrides: subscriptions.overrides,
          maxUsers: plans.maxUsers,
          maxWarehouses: plans.maxWarehouses,
          storageMb: plans.storageMb,
          features: plans.features,
        })
        .from(tenants)
        .leftJoin(
          subscriptions,
          and(eq(subscriptions.tenantId, tenants.id), ne(subscriptions.status, 'cancelled')),
        )
        .leftJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!row) throw new NotFoundError({ message: `Tenant not found: ${tenantId}` });

      const [members] = await db
        .select({ value: count() })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, 'active')));
      const [pending] = await db
        .select({ value: count() })
        .from(invitations)
        .where(
          and(
            eq(invitations.tenantId, tenantId),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, sql`now()`),
          ),
        );

      const hasSubscription = row.subscriptionStatus !== null && row.storageMb !== null;
      return {
        tenantStatus: row.tenantStatus as TenantStatus,
        subscription: hasSubscription
          ? {
              status: row.subscriptionStatus as SubscriptionStatus,
              overrides: row.overrides,
              plan: {
                maxUsers: row.maxUsers,
                maxWarehouses: row.maxWarehouses,
                storageMb: row.storageMb ?? 0,
                features: toFeatures(row.features ?? []),
              },
            }
          : null,
        seatsUsed: (members?.value ?? 0) + (pending?.value ?? 0),
      };
    },
  };
}
