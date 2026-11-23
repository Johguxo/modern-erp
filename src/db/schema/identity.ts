// Módulo identity (docs/dominio/modelo-datos.md): planes, clientes, suscripciones, usuarios,
// membresías, invitaciones, SuperAdmins y auditoría. RLS según ADR-004; grants en 0002.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';

import {
  appendOnlyPolicies,
  appUser,
  currentTenantId,
  currentUserId,
  tenantIsolation,
} from './rls';

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Lista SQL de roles válidos (src/shared/permissions.ts → TENANT_ROLES). */
const VALID_ROLES = sql`array['admin','requester','warehouse','approver','purchasing']::text[]`;

// ---------- Global ----------

export const plans = pgTable(
  'plans',
  {
    id: id(),
    code: text().notNull(),
    name: text().notNull(),
    maxUsers: integer(),
    maxWarehouses: integer(),
    storageMb: integer().notNull(),
    features: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('plans_code_key').on(t.code),
    check('plans_max_users_positive', sql`${t.maxUsers} is null or ${t.maxUsers} > 0`),
    check(
      'plans_max_warehouses_positive',
      sql`${t.maxWarehouses} is null or ${t.maxWarehouses} > 0`,
    ),
    check('plans_storage_positive', sql`${t.storageMb} > 0`),
    pgPolicy('plans_read', { for: 'select', to: appUser, using: sql`true` }),
  ],
);

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    status: text().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tenants_slug_key').on(t.slug),
    check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('tenants_status_check', sql`${t.status} in ('active','suspended','cancelled')`),
    pgPolicy('tenant_isolation', {
      for: 'all',
      to: appUser,
      using: sql`${t.id} = ${currentTenantId}`,
      withCheck: sql`${t.id} = ${currentTenantId}`,
    }),
    // withUser (/elegir-empresa): las empresas donde tengo membresía activa.
    pgPolicy('tenants_member_read', {
      for: 'select',
      to: appUser,
      using: sql`${currentTenantId} is null and exists (
        select 1 from memberships m
        where m.tenant_id = ${t.id} and m.user_id = ${currentUserId} and m.status = 'active'
      )`,
    }),
  ],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    authUserId: uuid(),
    email: text().notNull(),
    fullName: text().notNull(),
    phone: text(),
    status: text().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_auth_user_id_key').on(t.authUserId),
    check('users_email_normalized', sql`${t.email} = lower(btrim(${t.email}))`),
    check('users_status_check', sql`${t.status} in ('active','disabled')`),
    // Mi fila, o usuarios con membresía en el tenant activo.
    pgPolicy('users_read', {
      for: 'select',
      to: appUser,
      using: sql`${t.id} = ${currentUserId} or exists (
        select 1 from memberships m
        where m.user_id = ${t.id} and m.tenant_id = ${currentTenantId}
      )`,
    }),
  ],
);

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id),
  createdAt: createdAt(),
}).enableRLS(); // sin políticas: app_user no ve nada (solo getDbAdmin)

// ---------- Por tenant ----------

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    status: text().notNull().default('trial'),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    priceAmount: numeric({ precision: 14, scale: 2 }),
    priceCurrency: text().notNull().default('PEN'),
    overrides: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_tenant_id_idx').on(t.tenantId),
    // Una sola suscripción vigente (no cancelada) por tenant.
    uniqueIndex('subscriptions_one_current_per_tenant')
      .on(t.tenantId)
      .where(sql`${t.status} <> 'cancelled'`),
    check(
      'subscriptions_status_check',
      sql`${t.status} in ('trial','active','past_due','suspended','cancelled')`,
    ),
    check('subscriptions_currency_check', sql`${t.priceCurrency} in ('PEN','USD')`),
    tenantIsolation(t.tenantId),
  ],
);

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    tenantId: uuid()
      .primaryKey()
      .references(() => tenants.id),
    brand: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    currency: text().notNull().default('PEN'),
    timezone: text().notNull().default('America/Lima'),
    locale: text().notNull().default('es-PE'),
    loginMethods: text()
      .array()
      .notNull()
      .default(sql`'{password}'::text[]`),
    emailDomains: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notificationChannels: text()
      .array()
      .notNull()
      .default(sql`'{email}'::text[]`),
    roleLabels: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    inventory: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    integrations: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('tenant_settings_currency_check', sql`${t.currency} in ('PEN','USD')`),
    check('tenant_settings_locale_check', sql`${t.locale} in ('es-PE')`),
    tenantIsolation(t.tenantId),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    roles: text().array().notNull(),
    status: text().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('memberships_tenant_user_key').on(t.tenantId, t.userId),
    index('memberships_user_id_idx').on(t.userId),
    check(
      'memberships_roles_check',
      sql`cardinality(${t.roles}) > 0 and ${t.roles} <@ ${VALID_ROLES}`,
    ),
    check('memberships_status_check', sql`${t.status} in ('active','disabled')`),
    tenantIsolation(t.tenantId),
    // withUser (/elegir-empresa): mis membresías, sin tenant activo.
    pgPolicy('memberships_own_read', {
      for: 'select',
      to: appUser,
      using: sql`${currentTenantId} is null and ${t.userId} = ${currentUserId}`,
    }),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    email: text().notNull(),
    roles: text().array().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    invitedBy: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    // Una sola invitación pendiente por correo y empresa (E1-H3 la renueva, no inserta otra).
    uniqueIndex('invitations_one_pending_per_email')
      .on(t.tenantId, t.email)
      .where(sql`${t.acceptedAt} is null`),
    check('invitations_email_normalized', sql`${t.email} = lower(btrim(${t.email}))`),
    check(
      'invitations_roles_check',
      sql`cardinality(${t.roles}) > 0 and ${t.roles} <@ ${VALID_ROLES}`,
    ),
    tenantIsolation(t.tenantId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    /** Null en acciones de plataforma (solo las escribe getDbAdmin). */
    tenantId: uuid().references(() => tenants.id),
    actorUserId: uuid().references(() => users.id),
    actorType: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    data: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_events_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    check(
      'audit_events_actor_type_check',
      sql`${t.actorType} in ('user','platform_admin','system','external')`,
    ),
    ...appendOnlyPolicies(t.tenantId, 'audit'),
  ],
);
