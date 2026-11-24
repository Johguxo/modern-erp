// PlatformDeps en memoria (E1-H4): reutiliza el fake de gestión de usuarios (invitaciones,
// miembros, bloqueos, auditoría, Mailer, afterCommit) y agrega tenants, planes y suscripciones.
// La transacción no revierte: la atomicidad se prueba en integración.
import type { PlatformDeps, TenantSetupStep } from '@/modules/identity';
import type {
  PlanRecord,
  PlatformUnitOfWork,
  SubscriptionRecord,
} from '@/modules/identity/application/platform/ports';
import type { SubscriptionStatus } from '@/modules/identity/domain/entitlements';
import { ValidationError } from '@/shared/errors';

import { createInMemoryUserAdmin, type InMemoryUserAdmin } from './in-memory-user-admin';

export const PLATFORM_ADMIN_ID = '00000000-0000-4000-8000-00000000a001';

export interface StoredSubscription {
  readonly id: string;
  readonly tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  overrides: Record<string, unknown>;
  endsAt: Date | null;
}

export interface InMemoryPlatform extends Omit<InMemoryUserAdmin, 'deps'> {
  readonly deps: PlatformDeps;
  readonly tenants: { id: string; name: string; slug: string; currency?: string }[];
  readonly subscriptions: StoredSubscription[];
  readonly plans: PlanRecord[];
  readonly admins: Set<string>;
  readonly setupCalls: string[];
  addTenant(input?: { slug?: string; status?: SubscriptionStatus; planCode?: string }): string;
}

let counter = 0;
const nextId = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}`;
};

export function createInMemoryPlatform(
  options: { setupSteps?: TenantSetupStep[] } = {},
): InMemoryPlatform {
  const base = createInMemoryUserAdmin();
  const tenants: InMemoryPlatform['tenants'] = [];
  const subscriptions: StoredSubscription[] = [];
  const admins = new Set([PLATFORM_ADMIN_ID]);
  const setupCalls: string[] = [];
  const plans: PlanRecord[] = [
    { id: 'plan-basic', code: 'basic', name: 'Básico', active: true, maxUsers: 5 },
    { id: 'plan-pro', code: 'pro', name: 'Pro', active: true, maxUsers: 20 },
    { id: 'plan-old', code: 'old', name: 'Antiguo', active: false, maxUsers: 3 },
  ];

  const toRecord = (s: StoredSubscription): SubscriptionRecord & { endsAt: Date | null } => {
    const plan = plans.find((p) => p.id === s.planId);
    if (!plan) throw new Error('plan missing');
    return {
      id: s.id,
      planId: s.planId,
      planCode: plan.code,
      planName: plan.name,
      status: s.status,
      overrides: s.overrides,
      endsAt: s.endsAt,
      planLimits: { maxUsers: plan.maxUsers, maxWarehouses: 1, storageMb: 100, features: [] },
    };
  };

  const steps: TenantSetupStep[] = [
    {
      run: ({ tenantId }) => {
        setupCalls.push(tenantId);
        return Promise.resolve();
      },
    },
    ...(options.setupSteps ?? []),
  ];

  const user = base.deps;
  const uow: PlatformUnitOfWork = {
    isPlatformAdmin: (userId) => Promise.resolve(admins.has(userId)),
    findPlan: (code) => Promise.resolve(plans.find((p) => p.code === code) ?? null),
    insertTenant(input) {
      if (tenants.some((t) => t.slug === input.slug)) {
        return Promise.reject(
          new ValidationError({ reason: 'slug_taken', fieldErrors: { slug: ['slug_taken'] } }),
        );
      }
      const id = nextId('tenant');
      tenants.push({ id, ...input });
      return Promise.resolve(id);
    },
    insertSettings(input) {
      const tenant = tenants.find((t) => t.id === input.tenantId);
      if (tenant) tenant.currency = input.currency;
      return Promise.resolve();
    },
    insertSubscription(input) {
      const id = nextId('sub');
      subscriptions.push({ id, endsAt: null, ...input, overrides: { ...input.overrides } });
      return Promise.resolve(id);
    },
    lockTenant: (tenantId) => {
      base.locks.push(`tenant:${tenantId}`);
      return Promise.resolve(tenants.some((t) => t.id === tenantId));
    },
    latestSubscription(tenantId) {
      const mine = subscriptions.filter((s) => s.tenantId === tenantId);
      const found = mine.find((s) => s.status !== 'cancelled') ?? mine.at(-1);
      return Promise.resolve(found ? toRecord(found) : null);
    },
    updateSubscription(tenantId, id, input) {
      const found = subscriptions.find((s) => s.tenantId === tenantId && s.id === id);
      if (found) Object.assign(found, { ...input, overrides: { ...input.overrides } });
      return Promise.resolve();
    },
    findUserByEmail: () => Promise.resolve(null),
    createUser: () => Promise.resolve(nextId('user')),
    grantPlatformAdmin: (userId) => {
      const added = !admins.has(userId);
      admins.add(userId);
      return Promise.resolve(added);
    },
    setupSteps: steps,
    members: user.members,
    invitations: user.invitations,
    locks: user.locks,
    tenants: user.tenants,
    audit: user.audit,
    entitlements: user.entitlements,
  };

  const deps: PlatformDeps = {
    store: {
      listTenants: () => Promise.resolve([]),
      getTenant: () => Promise.resolve(null),
      listPlans: () => Promise.resolve(plans),
      transaction: (fn) => fn(uow),
    },
    mailer: user.mailer,
    clock: user.clock,
    logger: user.logger,
    client: user.client,
    afterCommit: user.afterCommit,
    appUrl: user.appUrl,
  };

  return {
    ...base,
    deps,
    tenants,
    subscriptions,
    plans,
    admins,
    setupCalls,
    addTenant(input = {}) {
      const id = nextId('tenant');
      tenants.push({ id, name: 'Acme', slug: input.slug ?? id });
      const plan = plans.find((p) => p.code === (input.planCode ?? 'basic'));
      subscriptions.push({
        id: nextId('sub'),
        tenantId: id,
        planId: plan?.id ?? 'plan-basic',
        status: input.status ?? 'active',
        overrides: {},
        endsAt: null,
      });
      return id;
    },
  };
}
