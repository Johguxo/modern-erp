// E0-H2 · helper `withTenant(ctx, fn)`: fija `app.tenant_id` con `set_config(..., true)` (equivale a
// `set local`) usando parámetros, nunca interpolando valores en el SQL.
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { AppDatabase } from './client';
import { runWithTenant, runWithUser, tenantSettingsQuery, userSettingsQuery } from './with-tenant';

const dialect = new PgDialect();
const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const INJECTION = "x' or 1=1 --";

/** Base falsa: si el helper llegara a abrir una transacción, la prueba falla. */
function untouchableDatabase(): { database: AppDatabase; calls: () => number } {
  let count = 0;
  const database = {
    transaction: () => {
      count += 1;
      throw new Error('no debió abrir una transacción');
    },
  } as unknown as AppDatabase;
  return { database, calls: () => count };
}

describe('withTenant fija app.tenant_id con set local (set_config(..., true))', () => {
  it('tenantSettingsQuery usa set_config local con parámetros $1 y $2, sin interpolar', () => {
    const query = dialect.sqlToQuery(tenantSettingsQuery({ tenantId: TENANT, userId: USER }));

    expect(query.sql).toBe(
      "select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)",
    );
    expect(query.params).toEqual([TENANT, USER]);
    expect(query.sql).not.toContain(TENANT);
    expect(query.sql).not.toContain(USER);
  });

  it('userSettingsQuery fija solo app.user_id con set_config local y parámetro $1', () => {
    const query = dialect.sqlToQuery(userSettingsQuery({ userId: USER }));

    expect(query.sql).toBe("select set_config('app.user_id', $1, true)");
    expect(query.params).toEqual([USER]);
    expect(query.sql).not.toContain('app.tenant_id');
  });

  it.each([
    ['tenantId con inyección SQL', { tenantId: INJECTION, userId: USER }, /tenantId/],
    ['userId con inyección SQL', { tenantId: TENANT, userId: INJECTION }, /userId/],
    ['tenantId vacío', { tenantId: '', userId: USER }, /tenantId/],
    ['tenantId con espacios alrededor', { tenantId: ` ${TENANT} `, userId: USER }, /tenantId/],
  ])('rechaza %s (no es UUID)', (_label, scope, message) => {
    expect(() => tenantSettingsQuery(scope)).toThrow(message);
  });

  it('userSettingsQuery rechaza un userId que no es UUID', () => {
    expect(() => userSettingsQuery({ userId: INJECTION })).toThrow(/userId/);
  });

  it('runWithTenant con UUID inválido lanza antes de tocar la base', async () => {
    const { database, calls } = untouchableDatabase();

    await expect(
      runWithTenant(database, { tenantId: INJECTION, userId: USER }, () => Promise.resolve(1)),
    ).rejects.toThrow(/tenantId debe ser un UUID/);
    expect(calls()).toBe(0);
  });

  it('runWithUser con UUID inválido lanza antes de tocar la base', async () => {
    const { database, calls } = untouchableDatabase();

    await expect(
      runWithUser(database, { userId: INJECTION }, () => Promise.resolve(1)),
    ).rejects.toThrow(/userId debe ser un UUID/);
    expect(calls()).toBe(0);
  });
});
