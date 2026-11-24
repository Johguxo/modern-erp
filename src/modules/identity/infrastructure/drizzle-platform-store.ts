// Store de la consola de plataforma (E1-H4, ADR-007) sobre la conexión dueño (getDbAdmin, sin
// RLS). Acotado: toda consulta de un cliente filtra por su tenantId explícito; las escrituras van
// en una transacción que el caso de uso abre, revisa platform_admins y audita.
import { and, asc, count, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { isUniqueViolation, type DbExecutor, type DbTransaction } from '@/db';
import {
  invitations,
  memberships,
  plans,
  platformAdmins,
  subscriptions,
  tenantSettings,
  tenants,
  users,
} from '@/db/schema';
import { ValidationError } from '@/shared/errors';

import type { SubscriptionStatus } from '../domain/entitlements';
import { PLAN_FEATURES, type PlanFeature } from '../domain/plan-features';
import { createEntitlements } from '../application/entitlements';
import type {
  PlanRecord,
  PlatformStore,
  PlatformUnitOfWork,
  SubscriptionRecord,
  TenantSetupStep,
} from '../application/platform/ports';

import { createDrizzleAuditLog } from './drizzle-audit-log';
import { createDrizzleEntitlementsRepository } from './drizzle-entitlements-repository';
import { createDrizzleInvitationRepository } from './drizzle-invitation-repository';
import { createDrizzleMemberRepository } from './drizzle-member-repository';
import { createDrizzleTenantDirectory, createDrizzleTenantLocks } from './drizzle-tenant-store';

/** Fábrica de un paso de alta sobre la transacción (la agrega cada historia en la entrega). */
export type TenantSetupStepFactory = (db: DbExecutor) => TenantSetupStep;

const subscriptionColumns = {
  id: subscriptions.id,
  planId: subscriptions.planId,
  status: subscriptions.status,
  overrides: subscriptions.overrides,
  endsAt: subscriptions.endsAt,
  planCode: plans.code,
  planName: plans.name,
  maxUsers: plans.maxUsers,
  maxWarehouses: plans.maxWarehouses,
  storageMb: plans.storageMb,
  features: plans.features,
};

type SubscriptionRow = {
  id: string;
  planId: string;
  status: string;
  overrides: unknown;
  endsAt: Date | null;
  planCode: string;
  planName: string;
  maxUsers: number | null;
  maxWarehouses: number | null;
  storageMb: number;
  features: string[];
};

function toFeatures(values: readonly string[]): PlanFeature[] {
  return values.filter((value): value is PlanFeature =>
    (PLAN_FEATURES as readonly string[]).includes(value),
  );
}

function toSubscription(row: SubscriptionRow): SubscriptionRecord & { endsAt: Date | null } {
  return {
    id: row.id,
    planId: row.planId,
    planCode: row.planCode,
    planName: row.planName,
    status: row.status as SubscriptionStatus,
    overrides: row.overrides,
    endsAt: row.endsAt,
    planLimits: {
      maxUsers: row.maxUsers,
      maxWarehouses: row.maxWarehouses,
      storageMb: row.storageMb,
      features: toFeatures(row.features),
    },
  };
}

/** Membresías activas (como cuenta Entitlements). */
const activeMembersCount = sql<number>`(
  select count(*)::int from ${memberships}
  where ${memberships.tenantId} = ${tenants.id} and ${memberships.status} = 'active'
)`;

/** Invitaciones pendientes sin vencer. */
const liveInvitationsCount = sql<number>`(
  select count(*)::int from ${invitations}
  where ${invitations.tenantId} = ${tenants.id}
    and ${invitations.acceptedAt} is null and ${invitations.expiresAt} > now()
)`;

/** La vigente primero; si no hay, la más reciente. */
async function latestSubscription(db: DbExecutor, tenantId: string) {
  const [row] = await db
    .select(subscriptionColumns)
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(sql`${subscriptions.status} = 'cancelled'`, desc(subscriptions.startsAt))
    .limit(1);
  return row ? toSubscription(row) : null;
}

function unitOfWork(tx: DbTransaction, setupSteps: readonly TenantSetupStepFactory[]) {
  const uow: PlatformUnitOfWork = {
    async isPlatformAdmin(userId) {
      const rows = await tx
        .select({ userId: platformAdmins.userId })
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, userId))
        .limit(1);
      return rows.length > 0;
    },

    async findPlan(code) {
      const [row] = await tx
        .select({
          id: plans.id,
          code: plans.code,
          name: plans.name,
          active: plans.active,
          maxUsers: plans.maxUsers,
        })
        .from(plans)
        .where(eq(plans.code, code))
        .limit(1);
      return row ?? null;
    },

    async insertTenant(input) {
      try {
        // Savepoint: si el slug choca, la transacción sigue válida para responder el error.
        const [row] = await tx.transaction((sp) =>
          sp.insert(tenants).values(input).returning({ id: tenants.id }),
        );
        if (!row) throw new Error('Tenant insert returned no row');
        return row.id;
      } catch (error) {
        if (isUniqueViolation(error, 'tenants_slug_key')) {
          throw new ValidationError({
            reason: 'slug_taken',
            fieldErrors: { slug: ['slug_taken'] },
            message: 'Slug already exists',
          });
        }
        throw error;
      }
    },

    async insertSettings(input) {
      await tx.insert(tenantSettings).values({
        tenantId: input.tenantId,
        currency: input.currency,
        timezone: 'America/Lima',
        locale: 'es-PE',
      });
    },

    async insertSubscription(input) {
      const [row] = await tx
        .insert(subscriptions)
        .values({
          tenantId: input.tenantId,
          planId: input.planId,
          status: input.status,
          overrides: input.overrides,
        })
        .returning({ id: subscriptions.id });
      if (!row) throw new Error('Subscription insert returned no row');
      return row.id;
    },

    async lockTenant(tenantId) {
      const rows = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .for('update')
        .limit(1);
      return rows.length > 0;
    },

    latestSubscription: (tenantId) => latestSubscription(tx, tenantId),

    async updateSubscription(tenantId, subscriptionId, input) {
      await tx
        .update(subscriptions)
        .set({
          planId: input.planId,
          status: input.status,
          overrides: input.overrides,
          endsAt: input.endsAt,
        })
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, subscriptionId)));
    },

    async findUserByEmail(email) {
      const [row] = await tx
        .select({ id: users.id, authUserId: users.authUserId })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return row ?? null;
    },

    async createUser(input) {
      const [row] = await tx.insert(users).values(input).returning({ id: users.id });
      if (!row) throw new Error('User insert returned no row');
      return row.id;
    },

    async grantPlatformAdmin(userId) {
      const rows = await tx
        .insert(platformAdmins)
        .values({ userId })
        .onConflictDoNothing()
        .returning({ userId: platformAdmins.userId });
      return rows.length > 0;
    },

    setupSteps: setupSteps.map((factory) => factory(tx)),
    members: createDrizzleMemberRepository(tx),
    invitations: createDrizzleInvitationRepository(tx),
    locks: createDrizzleTenantLocks(tx),
    tenants: createDrizzleTenantDirectory(tx),
    audit: createDrizzleAuditLog(tx),
    entitlements: createEntitlements({ repo: createDrizzleEntitlementsRepository(tx) }),
  };
  return uow;
}

/** La consola del MVP tiene pocos clientes: sin paginar, con tope. */
const LIST_LIMIT = 200;

export function createDrizzlePlatformStore(
  db: DbExecutor,
  setupSteps: readonly TenantSetupStepFactory[] = [],
): PlatformStore {
  return {
    async listTenants() {
      const rows = await db
        .select({
          tenantId: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          activeMembers: activeMembersCount,
          liveInvitations: liveInvitationsCount,
          subscriptionId: subscriptions.id,
          planId: subscriptions.planId,
          status: subscriptions.status,
          overrides: subscriptions.overrides,
          endsAt: subscriptions.endsAt,
          planCode: plans.code,
          planName: plans.name,
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
        .orderBy(asc(tenants.name))
        .limit(LIST_LIMIT);

      return rows.map((row) => ({
        tenantId: row.tenantId,
        name: row.name,
        slug: row.slug,
        activeMembers: Number(row.activeMembers),
        liveInvitations: Number(row.liveInvitations),
        subscription:
          row.subscriptionId && row.planId && row.status && row.planCode && row.planName
            ? toSubscription({
                id: row.subscriptionId,
                planId: row.planId,
                status: row.status,
                overrides: row.overrides,
                endsAt: row.endsAt,
                planCode: row.planCode,
                planName: row.planName,
                maxUsers: row.maxUsers,
                maxWarehouses: row.maxWarehouses,
                storageMb: row.storageMb ?? 0,
                features: row.features ?? [],
              })
            : null,
      }));
    },

    async getTenant(tenantId, now) {
      const [tenant] = await db
        .select({
          tenantId: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          createdAt: tenants.createdAt,
          currency: tenantSettings.currency,
          activeMembers: activeMembersCount,
        })
        .from(tenants)
        .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) return null;

      const [subscription, pending, [live]] = await Promise.all([
        latestSubscription(db, tenantId),
        db
          .select({
            invitationId: invitations.id,
            email: invitations.email,
            expiresAt: invitations.expiresAt,
          })
          .from(invitations)
          .where(and(eq(invitations.tenantId, tenantId), isNull(invitations.acceptedAt)))
          .orderBy(desc(invitations.createdAt))
          .limit(50),
        db
          .select({ value: count() })
          .from(invitations)
          .where(
            and(
              eq(invitations.tenantId, tenantId),
              isNull(invitations.acceptedAt),
              gt(invitations.expiresAt, now),
            ),
          ),
      ]);

      return {
        tenantId: tenant.tenantId,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
        currency: tenant.currency === 'USD' ? 'USD' : 'PEN',
        activeMembers: Number(tenant.activeMembers),
        liveInvitations: live?.value ?? 0,
        subscription,
        invitations: pending,
      };
    },

    async listPlans(): Promise<PlanRecord[]> {
      return db
        .select({
          id: plans.id,
          code: plans.code,
          name: plans.name,
          active: plans.active,
          maxUsers: plans.maxUsers,
        })
        .from(plans)
        .orderBy(asc(plans.maxUsers));
    },

    transaction: (fn) => db.transaction((tx) => fn(unitOfWork(tx, setupSteps))),
  };
}
