// Productos del tenant activo con la transacción de withTenant: RLS y filtro explícito por
// tenantId. app_user no puede cambiar el código ni borrar (grants de 0006).
import { and, asc, count, eq, ilike, inArray, sql } from 'drizzle-orm';

import { escapeLike, type DbExecutor } from '@/db';
import { products } from '@/db/schema';
import { offsetOf } from '@/shared/pagination';

import type { ProductRepository, ProductSearchItem, ProductView } from '../application/ports';
import { formatPrice, type Currency } from '../domain/money';

import { insertOrCodeTaken, masterWhere } from './master-data-sql';

const columns = {
  id: products.id,
  code: products.code,
  name: products.name,
  unit: products.unit,
  category: products.category,
  referencePrice: products.referencePrice,
  currency: products.currency,
  active: products.active,
};

type Row = {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  referencePrice: string | null;
  currency: string | null;
  active: boolean;
};

const toCurrency = (value: string | null): Currency | null =>
  value === 'PEN' || value === 'USD' ? value : null;

function toView(row: Row): ProductView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    category: row.category,
    referencePrice: row.referencePrice === null ? null : formatPrice(row.referencePrice),
    currency: toCurrency(row.currency),
    active: row.active,
  };
}

export function createDrizzleProductRepository(db: DbExecutor): ProductRepository {
  return {
    async list(tenantId, filter, page) {
      const where = masterWhere(products, tenantId, filter);
      const [rows, [totalRow]] = await Promise.all([
        db
          .select(columns)
          .from(products)
          .where(where)
          .orderBy(asc(products.code))
          .limit(page.pageSize)
          .offset(offsetOf(page)),
        db.select({ total: count() }).from(products).where(where),
      ]);
      return { items: rows.map(toView), total: totalRow?.total ?? 0 };
    },

    async lockById(tenantId, id) {
      const [row] = await db
        .select(columns)
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
        .for('update')
        .limit(1);
      return row ? toView(row) : null;
    },

    async create(tenantId, input) {
      const row = await insertOrCodeTaken(
        db,
        'products_tenant_code_key',
        input.code,
        async (tx) => {
          const [inserted] = await tx
            .insert(products)
            .values({
              tenantId,
              code: input.code,
              name: input.name,
              unit: input.unit,
              category: input.category,
              referencePrice: input.referencePrice,
              currency: input.currency,
            })
            .returning(columns);
          return inserted;
        },
      );
      if (!row) throw new Error('Product insert returned no row');
      return toView(row);
    },

    async update(tenantId, id, fields) {
      const [row] = await db
        .update(products)
        .set({
          name: fields.name,
          unit: fields.unit,
          category: fields.category,
          referencePrice: fields.referencePrice,
          currency: fields.currency,
        })
        .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
        .returning(columns);
      if (!row) throw new Error('Product update matched no row');
      return toView(row);
    },

    async setActive(tenantId, id, active) {
      await db
        .update(products)
        .set({ active })
        .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
    },

    async findByIds(tenantId, ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select(columns)
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, [...ids])));
      return rows.map(toView);
    },

    async findActiveByIds(tenantId, ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select(columns)
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(products.active, true),
            inArray(products.id, [...ids]),
          ),
        );
      return rows.map(toView);
    },

    async search(tenantId, q, limit) {
      const text = q.trim();
      const where = masterWhere(products, tenantId, { q: text, status: 'active' });
      // 0 = código exacto, 1 = el código empieza con q, 2 = el nombre empieza con q, 3 = el resto.
      const rank = sql<number>`case
        when ${products.code} = ${text.toUpperCase()} then 0
        when ${ilike(products.code, `${escapeLike(text)}%`)} then 1
        when ${ilike(products.name, `${escapeLike(text)}%`)} then 2
        else 3 end`;
      const rows = await db
        .select(columns)
        .from(products)
        .where(where)
        .orderBy(rank, asc(products.name), asc(products.code))
        .limit(limit);
      return rows.map((row): ProductSearchItem => {
        const view = toView(row);
        return {
          id: view.id,
          code: view.code,
          name: view.name,
          unit: view.unit,
          category: view.category,
          referencePrice: view.referencePrice,
          currency: view.currency,
        };
      });
    },
  };
}
