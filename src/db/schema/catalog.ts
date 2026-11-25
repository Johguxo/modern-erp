// Módulo catalog (docs/dominio/modelo-datos.md): almacenes, productos, equipos, centros de costo y
// trabajos de importación. RLS según ADR-004; grants en 0006 (sin DELETE: se desactiva, no se borra).
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants, users } from './identity';
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

/** Código normalizado (mayúsculas, sin espacios), de hasta 40 caracteres y con el patrón del dominio. */
const codeFormat = (code: AnyPgColumn) =>
  sql`${code} = upper(btrim(${code})) and char_length(${code}) <= 40 and ${code} ~ '^[A-Z0-9][A-Z0-9._/-]*$'`;

export const warehouses = pgTable(
  'warehouses',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    code: text().notNull(),
    name: text().notNull(),
    isDefault: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('warehouses_tenant_code_key').on(t.tenantId, t.code),
    // Un solo almacén por defecto por tenant.
    uniqueIndex('warehouses_one_default_per_tenant')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
    check('warehouses_code_normalized', codeFormat(t.code)),
    check('warehouses_code_not_empty', sql`${t.code} <> ''`),
    check('warehouses_name_not_empty', sql`btrim(${t.name}) <> ''`),
    tenantIsolation(t.tenantId),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    code: text().notNull(),
    name: text().notNull(),
    unit: text().notNull(),
    category: text(),
    referencePrice: numeric({ precision: 14, scale: 4 }),
    currency: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_tenant_code_key').on(t.tenantId, t.code),
    index('products_tenant_name_idx').on(t.tenantId, t.name),
    // Búsqueda por código o nombre (searchProducts); pg_trgm vive en el esquema extensions.
    index('products_code_trgm_idx').using('gin', t.code.op('extensions.gin_trgm_ops')),
    index('products_name_trgm_idx').using('gin', t.name.op('extensions.gin_trgm_ops')),
    check('products_code_normalized', codeFormat(t.code)),
    check('products_code_not_empty', sql`${t.code} <> ''`),
    check('products_name_not_empty', sql`btrim(${t.name}) <> ''`),
    check('products_unit_not_empty', sql`btrim(${t.unit}) <> ''`),
    check('products_currency_check', sql`${t.currency} is null or ${t.currency} in ('PEN','USD')`),
    check(
      'products_price_currency_check',
      sql`(${t.referencePrice} is null and ${t.currency} is null) or (${t.referencePrice} is not null and ${t.currency} is not null and ${t.referencePrice} >= 0)`,
    ),
    tenantIsolation(t.tenantId),
  ],
);

export const equipment = pgTable(
  'equipment',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    code: text().notNull(),
    name: text().notNull(),
    type: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('equipment_tenant_code_key').on(t.tenantId, t.code),
    check('equipment_code_normalized', codeFormat(t.code)),
    check('equipment_code_not_empty', sql`${t.code} <> ''`),
    check('equipment_name_not_empty', sql`btrim(${t.name}) <> ''`),
    tenantIsolation(t.tenantId),
  ],
);

export const costCenters = pgTable(
  'cost_centers',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    code: text().notNull(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('cost_centers_tenant_code_key').on(t.tenantId, t.code),
    check('cost_centers_code_normalized', codeFormat(t.code)),
    check('cost_centers_code_not_empty', sql`${t.code} <> ''`),
    check('cost_centers_name_not_empty', sql`btrim(${t.name}) <> ''`),
    tenantIsolation(t.tenantId),
  ],
);

/**
 * Trabajos de importación (E2-H3). `payload` guarda las filas sin validar hasta que el worker las
 * procesa (se pone en null al cerrar el job). El worker actualiza con app_user (grants de 0009).
 */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: id(),
    tenantId: tenantIdColumn(),
    kind: text().notNull(),
    status: text().notNull().default('pending'),
    filePath: text(),
    payload: jsonb(),
    summary: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    errors: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: uuid().references(() => users.id),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('import_jobs_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    check('import_jobs_kind_check', sql`${t.kind} in ('products','equipment','stock')`),
    check(
      'import_jobs_status_check',
      sql`${t.status} in ('pending','processing','completed','failed')`,
    ),
    tenantIsolation(t.tenantId),
  ],
);
