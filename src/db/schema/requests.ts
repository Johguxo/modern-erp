// Módulo requests (docs/dominio/modelo-datos.md): secuencias de numeración, solicitudes (SOF), sus
// líneas y el historial de revisiones de línea. RLS según ADR-004; grants en 0011 (sin DELETE en
// requests; el DELETE de líneas solo se permite con la solicitud en borrador).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { costCenters, equipment, products, warehouses } from './catalog';
import { tenants, users } from './identity';
import { appendOnlyPolicies, appUser, currentTenantId, tenantIsolation } from './rls';

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

export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: tenantIdColumn(),
    docType: text().notNull(),
    prefix: text().notNull(),
    nextNumber: integer().notNull().default(1),
    padding: integer().notNull().default(4),
    /** Último número emitido; null hasta el primer envío. */
    lastIssuedNumber: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'document_sequences_pkey', columns: [t.tenantId, t.docType] }),
    check('document_sequences_doc_type_check', sql`${t.docType} in ('SOF')`),
    check('document_sequences_prefix_check', sql`${t.prefix} ~ '^[A-Z0-9][A-Z0-9._/-]{0,15}$'`),
    check('document_sequences_next_number_check', sql`${t.nextNumber} >= 1`),
    check('document_sequences_padding_check', sql`${t.padding} between 1 and 10`),
    check(
      'document_sequences_last_issued_check',
      sql`${t.lastIssuedNumber} is null or (${t.lastIssuedNumber} >= 1 and ${t.lastIssuedNumber} < ${t.nextNumber})`,
    ),
    tenantIsolation(t.tenantId),
  ],
);

export const requests = pgTable(
  'requests',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    docType: text().notNull().default('SOF'),
    /** Null mientras es borrador (los borradores no consumen número). */
    number: text(),
    status: text().notNull().default('draft'),
    requesterId: uuid()
      .notNull()
      .references(() => users.id),
    costCenterId: uuid().references(() => costCenters.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id),
    equipmentId: uuid().references(() => equipment.id),
    reason: text(),
    currency: text().notNull(),
    totalAmount: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    submittedAt: timestamp({ withTimezone: true }),
    approvedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    /** Quién cerró la solicitud (anulación) y su comentario; null mientras sigue abierta. */
    closedBy: uuid().references(() => users.id),
    closeComment: text(),
    /** Bloqueo optimista: arranca en 1 y sube con cada cambio. */
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Número único por tipo dentro del tenant (los borradores no tienen).
    uniqueIndex('requests_tenant_doc_number_key')
      .on(t.tenantId, t.docType, t.number)
      .where(sql`${t.number} is not null`),
    index('requests_tenant_status_updated_idx').on(t.tenantId, t.status, t.updatedAt.desc()),
    index('requests_tenant_requester_updated_idx').on(
      t.tenantId,
      t.requesterId,
      t.updatedAt.desc(),
    ),
    index('requests_tenant_updated_idx').on(t.tenantId, t.updatedAt.desc()),
    check('requests_doc_type_check', sql`${t.docType} in ('SOF')`),
    check(
      'requests_status_check',
      sql`${t.status} in ('draft','in_approval','changes_requested','approved','delivered','rejected','cancelled')`,
    ),
    check('requests_currency_check', sql`${t.currency} in ('PEN','USD')`),
    check('requests_total_amount_check', sql`${t.totalAmount} >= 0`),
    check('requests_version_check', sql`${t.version} >= 1`),
    check('requests_reason_length_check', sql`char_length(${t.reason}) <= 500`),
    check(
      'requests_close_comment_check',
      sql`${t.closeComment} is null or (btrim(${t.closeComment}) <> '' and char_length(${t.closeComment}) <= 500)`,
    ),
    check(
      'requests_draft_without_number_check',
      sql`${t.status} <> 'draft' or ${t.number} is null`,
    ),
    check(
      'requests_number_required_check',
      sql`${t.status} in ('draft','cancelled') or ${t.number} is not null`,
    ),
    check(
      'requests_number_submitted_check',
      sql`(${t.number} is null) = (${t.submittedAt} is null)`,
    ),
    tenantIsolation(t.tenantId),
  ],
);

export const requestLines = pgTable(
  'request_lines',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id),
    lineNo: integer().notNull(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    productCodeSnapshot: text().notNull(),
    descriptionSnapshot: text().notNull(),
    unitSnapshot: text().notNull(),
    equipmentId: uuid().references(() => equipment.id),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric({ precision: 14, scale: 4 }).notNull(),
    subtotal: numeric({ precision: 14, scale: 2 }).notNull(),
    notes: text(),
    status: text().notNull().default('active'),
    revision: integer().notNull().default(1),
    needsReconfirmation: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('request_lines_tenant_request_line_no_key').on(t.tenantId, t.requestId, t.lineNo),
    index('request_lines_tenant_request_idx').on(t.tenantId, t.requestId),
    check('request_lines_line_no_check', sql`${t.lineNo} >= 1`),
    check('request_lines_quantity_check', sql`${t.quantity} > 0`),
    check('request_lines_unit_price_check', sql`${t.unitPrice} >= 0`),
    check('request_lines_subtotal_check', sql`${t.subtotal} >= 0`),
    check('request_lines_status_check', sql`${t.status} in ('active','removed')`),
    check('request_lines_revision_check', sql`${t.revision} >= 1`),
    check(
      'request_lines_snapshots_check',
      sql`btrim(${t.productCodeSnapshot}) <> '' and btrim(${t.descriptionSnapshot}) <> '' and btrim(${t.unitSnapshot}) <> ''`,
    ),
    check('request_lines_notes_length_check', sql`char_length(${t.notes}) <= 500`),
    tenantIsolation(t.tenantId),
    // Borrar una línea solo es posible con la solicitud en borrador (restrictiva: se suma a
    // tenant_isolation). Después del envío, quitar es status = 'removed' y la edición de «Cambios
    // solicitados» es en sitio (E4-H4), porque las revisiones apuntan a la línea.
    pgPolicy('request_lines_delete_only_draft', {
      as: 'restrictive',
      for: 'delete',
      to: appUser,
      using: sql`exists (
        select 1 from requests r
        where r.id = ${t.requestId} and r.tenant_id = ${currentTenantId}
          and r.status = 'draft'
      )`,
    }),
  ],
);

/** Historial de correcciones de línea (E4-H4): solo insert. */
export const requestLineRevisions = pgTable(
  'request_line_revisions',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id),
    requestLineId: uuid()
      .notNull()
      .references(() => requestLines.id),
    revision: integer().notNull(),
    snapshot: jsonb().notNull(),
    changedBy: uuid()
      .notNull()
      .references(() => users.id),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    reason: text().notNull(),
  },
  (t) => [
    unique('request_line_revisions_tenant_line_revision_key').on(
      t.tenantId,
      t.requestLineId,
      t.revision,
    ),
    index('request_line_revisions_tenant_request_idx').on(t.tenantId, t.requestId),
    check('request_line_revisions_revision_check', sql`${t.revision} >= 1`),
    check('request_line_revisions_reason_check', sql`btrim(${t.reason}) <> ''`),
    ...appendOnlyPolicies(t.tenantId, 'request_line_revisions'),
  ],
);
