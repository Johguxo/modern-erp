// E0-H2 · Criterio principal: app_user sin app.tenant_id no ve filas de una tabla con RLS.
// Incluye el aislamiento entre dos tenants (A y B) y que el contexto no se filtra entre transacciones.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb, type AppDatabase } from '@/db/client';
import { runWithTenant, withTenant, withUser } from '@/db/with-tenant';

import {
  createRlsProbeTable,
  createSingleConnectionAppDb,
  dropTable,
  expectPgError,
  newId,
  probeTableName,
} from '../helpers/db';

const TABLE = probeTableName();
const table = sql.identifier(TABLE);
const TENANT_A = newId();
const TENANT_B = newId();
const USER = newId();

let single: AppDatabase;

const selectLabels = sql`select label from public.${table} order by label`;

beforeAll(async () => {
  await createRlsProbeTable(TABLE);
  await getDbAdmin().execute(sql`
    insert into public.${table} (tenant_id, label) values
      (${TENANT_A}, 'a-1'), (${TENANT_A}, 'a-2'), (${TENANT_B}, 'b-1')`);
  single = createSingleConnectionAppDb();
});

afterAll(async () => {
  await single?.$client.end({ timeout: 5 });
  await dropTable(TABLE);
  await closeDatabases();
});

describe('app_user sin app.tenant_id no ve filas de una tabla con RLS', () => {
  it('sin contexto, fuera de transacción, app_user ve 0 filas', async () => {
    const rows = await getDb().execute(selectLabels);

    expect(rows).toHaveLength(0);
  });

  it('sin contexto, dentro de una transacción, app_user ve 0 filas', async () => {
    const rows = await getDb().transaction((tx) => tx.execute(selectLabels));

    expect(rows).toHaveLength(0);
  });
});

describe('aislamiento entre dos tenants con withTenant', () => {
  it('withTenant(A) ve solo las 2 filas de A', async () => {
    const rows = await withTenant({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.execute<{ label: string }>(selectLabels),
    );

    expect(rows.map((r) => r.label)).toEqual(['a-1', 'a-2']);
  });

  it('withTenant(B) ve solo la fila de B', async () => {
    const rows = await withTenant({ tenantId: TENANT_B, userId: USER }, (tx) =>
      tx.execute<{ label: string }>(selectLabels),
    );

    expect(rows.map((r) => r.label)).toEqual(['b-1']);
  });

  it('dentro de withTenant(A) no se puede insertar una fila de B (42501, row-level security)', async () => {
    const code = await expectPgError(() =>
      withTenant({ tenantId: TENANT_A, userId: USER }, (tx) =>
        tx.execute(
          sql`insert into public.${table} (tenant_id, label) values (${TENANT_B}, 'intruso')`,
        ),
      ),
    );

    expect(code).toBe('42501');
    const leaked = await getDbAdmin().execute(
      sql`select 1 from public.${table} where label = 'intruso'`,
    );
    expect(leaked).toHaveLength(0);
  });
});

describe('el contexto es local a la transacción (set local)', () => {
  it('tras runWithTenant(A), la misma conexión sin contexto tiene app.tenant_id vacío y ve 0 filas', async () => {
    type Session = { pid: number; tenant: string | null };
    const sessionQuery = sql`select pg_backend_pid() as pid, current_setting('app.tenant_id', true) as tenant`;

    const inside = await runWithTenant(
      single,
      { tenantId: TENANT_A, userId: USER },
      async (tx) => ({
        rows: await tx.execute(selectLabels),
        session: (await tx.execute<Session>(sessionQuery))[0],
      }),
    );
    expect(inside.rows).toHaveLength(2);
    expect(inside.session?.tenant).toBe(TENANT_A);

    const [after] = await single.execute<Session>(sessionQuery);
    // Misma conexión física (max: 1): lo que se ve es lo que dejó la transacción anterior.
    expect(after?.pid).toBe(inside.session?.pid);
    expect(after?.tenant).toBe('');

    const rows = await single.execute(selectLabels);
    expect(rows).toHaveLength(0);
  });

  it('withUser(U) fija app.current_user_id() = U y deja app.current_tenant_id() en null', async () => {
    const [row] = await withUser({ userId: USER }, (tx) =>
      tx.execute<{ user_id: string | null; tenant_id: string | null }>(
        sql`select app.current_user_id() as user_id, app.current_tenant_id() as tenant_id`,
      ),
    );

    expect(row).toEqual({ user_id: USER, tenant_id: null });
  });
});
