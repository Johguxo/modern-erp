// Módulo approvals (docs/dominio/modelo-datos.md): políticas de aprobación y sus pasos (E4-H1).
// RLS según ADR-004; grants y backfill en 0016. Las instancias y los pasos de aprobación llegan con
// E4-H2.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './identity';
import { tenantIsolation } from './rls';

const id = () => uuid().primaryKey().defaultRandom();
const tenantIdColumn = () =>
  uuid()
    .notNull()
    .references(() => tenants.id);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const approvalPolicies = pgTable(
  'approval_policies',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    docType: text().notNull(),
    name: text().notNull(),
    /** Futuro: condiciones para elegir la política (no se evalúan en el MVP). */
    conditions: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Futuro: gana la de mayor prioridad cuyas condiciones se cumplan. */
    priority: integer().notNull().default(100),
    settings: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    active: boolean().notNull().default(true),
    /** Bloqueo optimista: arranca en 1 y sube con cada guardado de los pasos. */
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Una política activa por tipo de documento dentro del tenant (MVP).
    uniqueIndex('approval_policies_tenant_doc_type_active_key')
      .on(t.tenantId, t.docType)
      .where(sql`${t.active}`),
    check('approval_policies_doc_type_check', sql`${t.docType} in ('SOF')`),
    check(
      'approval_policies_name_check',
      sql`btrim(${t.name}) <> '' and char_length(${t.name}) <= 80`,
    ),
    check('approval_policies_version_check', sql`${t.version} >= 1`),
    tenantIsolation(t.tenantId),
  ],
);

export const approvalPolicySteps = pgTable(
  'approval_policy_steps',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    policyId: uuid()
      .notNull()
      .references(() => approvalPolicies.id),
    stepOrder: integer().notNull(),
    name: text().notNull(),
    approverType: text().notNull(),
    /** `role`: código del rol (texto JSON). `users`: arreglo de ids de usuario (sin FK; se valida al guardar). */
    approverRef: jsonb().notNull(),
    rule: text().notNull().default('any'),
    /** Para saltarse el paso si no aplica; el MVP solo evalúa `min_amount`. */
    condition: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    unique('approval_policy_steps_tenant_policy_order_key').on(t.tenantId, t.policyId, t.stepOrder),
    index('approval_policy_steps_tenant_policy_idx').on(t.tenantId, t.policyId),
    check('approval_policy_steps_step_order_check', sql`${t.stepOrder} >= 1`),
    check(
      'approval_policy_steps_name_check',
      sql`btrim(${t.name}) <> '' and char_length(${t.name}) <= 80`,
    ),
    check(
      'approval_policy_steps_approver_type_check',
      sql`${t.approverType} in ('users','role','requester_manager','external_email')`,
    ),
    check(
      'approval_policy_steps_approver_ref_check',
      sql`(${t.approverType} = 'role' and jsonb_typeof(${t.approverRef}) = 'string')
        or (${t.approverType} = 'users' and jsonb_typeof(${t.approverRef}) = 'array')
        or ${t.approverType} in ('requester_manager','external_email')`,
    ),
    check('approval_policy_steps_rule_check', sql`${t.rule} in ('any','all')`),
    check('approval_policy_steps_condition_check', sql`jsonb_typeof(${t.condition}) = 'object'`),
    tenantIsolation(t.tenantId),
  ],
);
