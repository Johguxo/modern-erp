// Equipos y centros de costo del tenant activo con la transacción de withTenant: RLS y filtro
// explícito por tenantId. app_user no puede cambiar el código ni borrar (grants de 0006).
import { and, asc, count, eq, inArray } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { costCenters, equipment } from '@/db/schema';
import { offsetOf } from '@/shared/pagination';

import type {
  CostCenterFields,
  CostCenterView,
  EquipmentFields,
  EquipmentView,
  MasterRepository,
} from '../application/ports';

import { insertOrCodeTaken, masterWhere } from './master-data-sql';

const equipmentColumns = {
  id: equipment.id,
  code: equipment.code,
  name: equipment.name,
  type: equipment.type,
  active: equipment.active,
};

const costCenterColumns = {
  id: costCenters.id,
  code: costCenters.code,
  name: costCenters.name,
  active: costCenters.active,
};

export function createDrizzleEquipmentRepository(
  db: DbExecutor,
): MasterRepository<EquipmentView, EquipmentFields> {
  return {
    async list(tenantId, filter, page) {
      const where = masterWhere(equipment, tenantId, filter);
      const [items, [totalRow]] = await Promise.all([
        db
          .select(equipmentColumns)
          .from(equipment)
          .where(where)
          .orderBy(asc(equipment.code))
          .limit(page.pageSize)
          .offset(offsetOf(page)),
        db.select({ total: count() }).from(equipment).where(where),
      ]);
      return { items, total: totalRow?.total ?? 0 };
    },

    async lockById(tenantId, id) {
      const [row] = await db
        .select(equipmentColumns)
        .from(equipment)
        .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)))
        .for('update')
        .limit(1);
      return row ?? null;
    },

    async create(tenantId, input) {
      const row = await insertOrCodeTaken(
        db,
        'equipment_tenant_code_key',
        input.code,
        async (tx) => {
          const [inserted] = await tx
            .insert(equipment)
            .values({ tenantId, code: input.code, name: input.name, type: input.type })
            .returning(equipmentColumns);
          return inserted;
        },
      );
      if (!row) throw new Error('Equipment insert returned no row');
      return row;
    },

    async update(tenantId, id, fields) {
      const [row] = await db
        .update(equipment)
        .set({ name: fields.name, type: fields.type })
        .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)))
        .returning(equipmentColumns);
      if (!row) throw new Error('Equipment update matched no row');
      return row;
    },

    async setActive(tenantId, id, active) {
      await db
        .update(equipment)
        .set({ active })
        .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)));
    },

    async findActiveByIds(tenantId, ids) {
      if (ids.length === 0) return [];
      return db
        .select(equipmentColumns)
        .from(equipment)
        .where(
          and(
            eq(equipment.tenantId, tenantId),
            eq(equipment.active, true),
            inArray(equipment.id, [...ids]),
          ),
        );
    },
  };
}

export function createDrizzleCostCenterRepository(
  db: DbExecutor,
): MasterRepository<CostCenterView, CostCenterFields> {
  return {
    async list(tenantId, filter, page) {
      const where = masterWhere(costCenters, tenantId, filter);
      const [items, [totalRow]] = await Promise.all([
        db
          .select(costCenterColumns)
          .from(costCenters)
          .where(where)
          .orderBy(asc(costCenters.code))
          .limit(page.pageSize)
          .offset(offsetOf(page)),
        db.select({ total: count() }).from(costCenters).where(where),
      ]);
      return { items, total: totalRow?.total ?? 0 };
    },

    async lockById(tenantId, id) {
      const [row] = await db
        .select(costCenterColumns)
        .from(costCenters)
        .where(and(eq(costCenters.tenantId, tenantId), eq(costCenters.id, id)))
        .for('update')
        .limit(1);
      return row ?? null;
    },

    async create(tenantId, input) {
      const row = await insertOrCodeTaken(
        db,
        'cost_centers_tenant_code_key',
        input.code,
        async (tx) => {
          const [inserted] = await tx
            .insert(costCenters)
            .values({ tenantId, code: input.code, name: input.name })
            .returning(costCenterColumns);
          return inserted;
        },
      );
      if (!row) throw new Error('Cost center insert returned no row');
      return row;
    },

    async update(tenantId, id, fields) {
      const [row] = await db
        .update(costCenters)
        .set({ name: fields.name })
        .where(and(eq(costCenters.tenantId, tenantId), eq(costCenters.id, id)))
        .returning(costCenterColumns);
      if (!row) throw new Error('Cost center update matched no row');
      return row;
    },

    async setActive(tenantId, id, active) {
      await db
        .update(costCenters)
        .set({ active })
        .where(and(eq(costCenters.tenantId, tenantId), eq(costCenters.id, id)));
    },

    async findActiveByIds(tenantId, ids) {
      if (ids.length === 0) return [];
      return db
        .select(costCenterColumns)
        .from(costCenters)
        .where(
          and(
            eq(costCenters.tenantId, tenantId),
            eq(costCenters.active, true),
            inArray(costCenters.id, [...ids]),
          ),
        );
    },
  };
}
