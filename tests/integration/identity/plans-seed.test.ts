// E1-H1 · Planes de referencia por migración (0003): existen con sus valores y la migración es
// idempotente.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { plans } from '@/db/schema';

const CODES = ['starter', 'business', 'enterprise'];
const MIGRATION = path.resolve(
  import.meta.dirname,
  '../../../src/db/migrations/0003_seed_plans.sql',
);

afterAll(async () => {
  await closeDatabases();
});

async function loadPlans() {
  return getDbAdmin()
    .select({
      code: plans.code,
      maxUsers: plans.maxUsers,
      maxWarehouses: plans.maxWarehouses,
      storageMb: plans.storageMb,
      features: plans.features,
      active: plans.active,
    })
    .from(plans)
    .where(inArray(plans.code, CODES))
    .orderBy(plans.storageMb);
}

describe('planes de referencia (0003_seed_plans)', () => {
  it('existen starter, business y enterprise con los valores del plan', async () => {
    const rows = await loadPlans();

    expect(rows).toEqual([
      {
        code: 'starter',
        maxUsers: 10,
        maxWarehouses: 1,
        storageMb: 1024,
        features: ['sof'],
        active: true,
      },
      {
        code: 'business',
        maxUsers: 30,
        maxWarehouses: 3,
        storageMb: 5120,
        features: ['sof', 'dashboard'],
        active: true,
      },
      {
        code: 'enterprise',
        maxUsers: null,
        maxWarehouses: null,
        storageMb: 20480,
        features: ['sof', 'dashboard', 'microsoft_login', 'external_approvals'],
        active: true,
      },
    ]);
  });

  it('ejecutar otra vez el insert de 0003 no duplica los planes', async () => {
    const migration = await readFile(MIGRATION, 'utf8');

    await getDbAdmin().execute(sql.raw(migration));

    const [row] = await getDbAdmin().execute<{ n: number }>(
      sql`select count(*)::int as n from plans where code in ('starter', 'business', 'enterprise')`,
    );
    expect(row?.n).toBe(3);
    expect(await loadPlans()).toHaveLength(3);
  });
});
