// Módulo approvals (docs/dominio/modelo-datos.md): políticas de aprobación y sus pasos (E4-H1) e
// instancias, pasos copiados, asignados y eventos de aprobación (E4-H2). RLS según ADR-004; grants
// y backfill de políticas en 0016; grants de las instancias en 0018.
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

import { tenants, users } from './identity';
import { requests } from './requests';
import { appendOnlyPolicies, tenantIsolation } from './rls';

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

/** Una instancia por ronda de aprobación de un documento (reenviar tras pedir cambios abre otra). */
export const approvalInstances = pgTable(
  'approval_instances',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id),
    /** 1 al enviar; sube en uno con cada reenvío. */
    round: integer().notNull().default(1),
    policyId: uuid()
      .notNull()
      .references(() => approvalPolicies.id),
    /** Copia de la política (nombre, versión y pasos) al enviar: editarla no cambia lo que corre. */
    policySnapshot: jsonb().notNull(),
    status: text().notNull().default('in_progress'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('approval_instances_tenant_request_round_key').on(t.tenantId, t.requestId, t.round),
    check('approval_instances_round_check', sql`${t.round} >= 1`),
    check(
      'approval_instances_status_check',
      sql`${t.status} in ('in_progress','approved','rejected','changes_requested','cancelled')`,
    ),
    tenantIsolation(t.tenantId),
  ],
);

export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    instanceId: uuid()
      .notNull()
      .references(() => approvalInstances.id),
    /** Desnormalizado de la instancia: la bandeja y la visibilidad filtran por solicitud. */
    requestId: uuid()
      .notNull()
      .references(() => requests.id),
    stepOrder: integer().notNull(),
    name: text().notNull(),
    kind: text().notNull().default('normal'),
    rule: text().notNull(),
    status: text().notNull(),
    /** Solo en pasos de reconfirmación (E4-H4). */
    lineIds: uuid().array(),
    pendingSince: timestamp({ withTimezone: true }),
    decidedBy: uuid().references(() => users.id),
    decidedAt: timestamp({ withTimezone: true }),
    comment: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('approval_steps_tenant_instance_idx').on(t.tenantId, t.instanceId),
    index('approval_steps_tenant_request_idx').on(t.tenantId, t.requestId),
    check('approval_steps_step_order_check', sql`${t.stepOrder} >= 1`),
    check('approval_steps_kind_check', sql`${t.kind} in ('normal','reconfirmation')`),
    check('approval_steps_rule_check', sql`${t.rule} in ('any','all')`),
    check(
      'approval_steps_status_check',
      sql`${t.status} in ('waiting','pending','approved','rejected','changes_requested','skipped','cancelled')`,
    ),
    check('approval_steps_comment_check', sql`char_length(${t.comment}) <= 500`),
    tenantIsolation(t.tenantId),
  ],
);

export const approvalStepAssignees = pgTable(
  'approval_step_assignees',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    stepId: uuid()
      .notNull()
      .references(() => approvalSteps.id),
    userId: uuid().references(() => users.id),
    /** Reservado para el aprobador externo (fase 2). */
    externalEmail: text(),
    decision: text(),
    decidedAt: timestamp({ withTimezone: true }),
    comment: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('approval_step_assignees_tenant_step_user_key').on(t.tenantId, t.stepId, t.userId),
    index('approval_step_assignees_tenant_user_idx').on(t.tenantId, t.userId),
    index('approval_step_assignees_tenant_step_idx').on(t.tenantId, t.stepId),
    check(
      'approval_step_assignees_target_check',
      sql`(${t.userId} is not null) <> (${t.externalEmail} is not null)`,
    ),
    check(
      'approval_step_assignees_decision_check',
      sql`${t.decision} is null or ${t.decision} in ('approved','rejected','changes_requested')`,
    ),
    check('approval_step_assignees_comment_check', sql`char_length(${t.comment}) <= 500`),
    tenantIsolation(t.tenantId),
  ],
);

/** Línea de tiempo de la aprobación: solo insert (CLAUDE.md regla 7). */
export const approvalEvents = pgTable(
  'approval_events',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id),
    instanceId: uuid().references(() => approvalInstances.id),
    stepId: uuid().references(() => approvalSteps.id),
    type: text().notNull(),
    actorType: text().notNull(),
    actorUserId: uuid().references(() => users.id),
    comment: text(),
    data: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index('approval_events_tenant_request_created_idx').on(t.tenantId, t.requestId, t.createdAt),
    check('approval_events_actor_type_check', sql`${t.actorType} in ('user','system','external')`),
    check(
      'approval_events_actor_user_check',
      sql`${t.actorType} <> 'user' or ${t.actorUserId} is not null`,
    ),
    check('approval_events_comment_check', sql`char_length(${t.comment}) <= 500`),
    check('approval_events_data_check', sql`jsonb_typeof(${t.data}) = 'object'`),
    ...appendOnlyPolicies(t.tenantId, 'approval_events'),
  ],
);
