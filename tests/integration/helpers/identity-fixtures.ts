// Datos de identity para pruebas de integración (E1-H1). Se crean con getDbAdmin() (sin RLS),
// con slugs y correos aleatorios en minúsculas para no chocar con otras corridas ni con el seed,
// y `cleanup()` borra todo lo creado en orden de FKs.
import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';

import { getDbAdmin } from '@/db/admin';
import { pgErrorCode } from '@/db/errors';
import {
  auditEvents,
  invitations,
  memberships,
  plans,
  subscriptions,
  tenantSettings,
  tenants,
  users,
} from '@/db/schema';
import type { Role } from '@/shared/permissions';

type TenantStatus = 'active' | 'suspended' | 'cancelled';
type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

/** Fechas fijas lejanas: no dependen de la hora real. */
export const FAR_FUTURE = new Date('2999-01-01T00:00:00.000Z');
export const FAR_PAST = new Date('2000-01-01T00:00:00.000Z');

const shortId = (): string => randomUUID().replaceAll('-', '').slice(0, 12);

export const randomSlug = (): string => `t-${shortId()}`;
export const randomEmail = (): string => `u-${shortId()}@test.linkus.pe`;

export interface IdentityFixtures {
  tenant(opts?: { status?: TenantStatus; slug?: string }): Promise<{ id: string; slug: string }>;
  user(opts?: { email?: string; status?: 'active' | 'disabled' }): Promise<{
    id: string;
    email: string;
  }>;
  membership(
    tenantId: string,
    userId: string,
    opts?: { roles?: string[]; status?: 'active' | 'disabled' },
  ): Promise<{ id: string }>;
  invitation(
    tenantId: string,
    opts?: { email?: string; roles?: string[]; expiresAt?: Date; acceptedAt?: Date | null },
  ): Promise<{ id: string; email: string }>;
  subscription(
    tenantId: string,
    planCode: 'starter' | 'business' | 'enterprise',
    opts?: { status?: SubscriptionStatus; overrides?: unknown },
  ): Promise<{ id: string }>;
  settings(tenantId: string): Promise<void>;
  auditEvent(tenantId: string, opts?: { action?: string }): Promise<{ id: string }>;
  /** Registra un tenant creado por fuera del helper para borrarlo en cleanup. */
  trackTenant(id: string): void;
  cleanup(): Promise<void>;
}

export function createIdentityFixtures(): IdentityFixtures {
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const db = () => getDbAdmin();

  return {
    async tenant(opts = {}) {
      const slug = opts.slug ?? randomSlug();
      const [row] = await db()
        .insert(tenants)
        .values({ name: `Tenant ${slug}`, slug, status: opts.status ?? 'active' })
        .returning({ id: tenants.id });
      if (!row) throw new Error('tenant no creado');
      tenantIds.push(row.id);
      return { id: row.id, slug };
    },

    async user(opts = {}) {
      const email = opts.email ?? randomEmail();
      const [row] = await db()
        .insert(users)
        .values({ email, fullName: `User ${email}`, status: opts.status ?? 'active' })
        .returning({ id: users.id });
      if (!row) throw new Error('user no creado');
      userIds.push(row.id);
      return { id: row.id, email };
    },

    async membership(tenantId, userId, opts = {}) {
      const [row] = await db()
        .insert(memberships)
        .values({
          tenantId,
          userId,
          roles: opts.roles ?? (['requester'] satisfies Role[]),
          status: opts.status ?? 'active',
        })
        .returning({ id: memberships.id });
      if (!row) throw new Error('membership no creada');
      return row;
    },

    async invitation(tenantId, opts = {}) {
      const email = opts.email ?? randomEmail();
      const [row] = await db()
        .insert(invitations)
        .values({
          tenantId,
          email,
          roles: opts.roles ?? ['requester'],
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: opts.expiresAt ?? FAR_FUTURE,
          acceptedAt: opts.acceptedAt ?? null,
        })
        .returning({ id: invitations.id });
      if (!row) throw new Error('invitation no creada');
      return { id: row.id, email };
    },

    async subscription(tenantId, planCode, opts = {}) {
      const [plan] = await db()
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.code, planCode));
      if (!plan) throw new Error(`plan ${planCode} no existe (¿falta la migración 0003?)`);
      const [row] = await db()
        .insert(subscriptions)
        .values({
          tenantId,
          planId: plan.id,
          status: opts.status ?? 'active',
          overrides: opts.overrides ?? {},
        })
        .returning({ id: subscriptions.id });
      if (!row) throw new Error('subscription no creada');
      return row;
    },

    async settings(tenantId) {
      await db().insert(tenantSettings).values({ tenantId });
    },

    async auditEvent(tenantId, opts = {}) {
      const [row] = await db()
        .insert(auditEvents)
        .values({
          tenantId,
          actorType: 'system',
          action: opts.action ?? 'test.fixture',
          entityType: 'tenant',
          entityId: tenantId,
        })
        .returning({ id: auditEvents.id });
      if (!row) throw new Error('audit_event no creado');
      return row;
    },

    trackTenant(id) {
      tenantIds.push(id);
    },

    async cleanup() {
      const admin = db();
      if (tenantIds.length > 0) {
        await admin.delete(auditEvents).where(inArray(auditEvents.tenantId, tenantIds));
        await admin.delete(invitations).where(inArray(invitations.tenantId, tenantIds));
        await admin.delete(memberships).where(inArray(memberships.tenantId, tenantIds));
        await admin.delete(subscriptions).where(inArray(subscriptions.tenantId, tenantIds));
        await admin.delete(tenantSettings).where(inArray(tenantSettings.tenantId, tenantIds));
      }
      if (userIds.length > 0) {
        await admin.delete(memberships).where(inArray(memberships.userId, userIds));
        await admin.delete(invitations).where(inArray(invitations.invitedBy, userIds));
        await admin.delete(auditEvents).where(inArray(auditEvents.actorUserId, userIds));
        await admin.delete(users).where(inArray(users.id, userIds));
      }
      if (tenantIds.length > 0) {
        await admin.delete(tenants).where(inArray(tenants.id, tenantIds));
      }
      tenantIds.length = 0;
      userIds.length = 0;
    },
  };
}

/** Mensaje de error de Postgres (Drizzle lo envuelve en `cause`). */
export function pgErrorMessage(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && 'message' in current && typeof current.message === 'string') {
      return current.message;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Ejecuta fn y devuelve SQLSTATE y mensaje; falla si no lanza. */
export async function capturePgError(
  fn: () => Promise<unknown>,
): Promise<{ code: string | undefined; message: string }> {
  try {
    await fn();
  } catch (error) {
    return { code: pgErrorCode(error), message: pgErrorMessage(error) };
  }
  throw new Error('Se esperaba un error de Postgres y la consulta pasó.');
}
