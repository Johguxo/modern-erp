// Upsert en bloque por código (E2-H3) con la transacción de withTenant: RLS y tenant_id explícito.
// INSERT … ON CONFLICT (tenant_id, code) DO UPDATE solo de los campos editables y solo si algo
// cambió (IS DISTINCT FROM): así las filas iguales no se tocan y se pueden contar como "sin
// cambios". Nunca cambia `active`, `code` ni `tenant_id` (un inactivo sigue inactivo).
import { sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { equipment, products } from '@/db/schema';

import type { BulkUpsertRepository, UpsertManyResult } from '../application/import-ports';
import type { EquipmentFields, ProductFields } from '../application/ports';

/** xmax = 0 solo en las filas recién insertadas (las actualizadas llevan el xid de la transacción). */
const inserted = sql<boolean>`(xmax = 0)`;

function counts(total: number, returned: { inserted: boolean }[]): UpsertManyResult {
  const created = returned.filter((row) => row.inserted).length;
  const updated = returned.length - created;
  // Lo que el WHERE descartó no vuelve en RETURNING: eran filas idénticas.
  return { created, updated, unchanged: total - returned.length };
}

export function createDrizzleProductBulkUpsert(
  db: DbExecutor,
): BulkUpsertRepository<ProductFields> {
  return {
    async upsertManyByCode(tenantId, rows) {
      if (rows.length === 0) return { created: 0, updated: 0, unchanged: 0 };
      const returned = await db
        .insert(products)
        .values(
          rows.map((row) => ({
            tenantId,
            code: row.code,
            name: row.name,
            unit: row.unit,
            category: row.category,
            referencePrice: row.referencePrice,
            currency: row.currency,
          })),
        )
        .onConflictDoUpdate({
          target: [products.tenantId, products.code],
          set: {
            name: sql`excluded.name`,
            unit: sql`excluded.unit`,
            category: sql`excluded.category`,
            referencePrice: sql`excluded.reference_price`,
            currency: sql`excluded.currency`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`(${products.name}, ${products.unit}, ${products.category}, ${products.referencePrice}, ${products.currency})
            is distinct from (excluded.name, excluded.unit, excluded.category, excluded.reference_price, excluded.currency)`,
        })
        .returning({ inserted });
      return counts(rows.length, returned);
    },
  };
}

export function createDrizzleEquipmentBulkUpsert(
  db: DbExecutor,
): BulkUpsertRepository<EquipmentFields> {
  return {
    async upsertManyByCode(tenantId, rows) {
      if (rows.length === 0) return { created: 0, updated: 0, unchanged: 0 };
      const returned = await db
        .insert(equipment)
        .values(rows.map((row) => ({ tenantId, code: row.code, name: row.name, type: row.type })))
        .onConflictDoUpdate({
          target: [equipment.tenantId, equipment.code],
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`(${equipment.name}, ${equipment.type}) is distinct from (excluded.name, excluded.type)`,
        })
        .returning({ inserted });
      return counts(rows.length, returned);
    },
  };
}
