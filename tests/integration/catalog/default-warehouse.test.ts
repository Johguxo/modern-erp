// E2-H1 · Almacén por defecto: paso de alta (createTenant), idempotencia, aislamiento y backfill
// de la migración 0006 para tenants que ya existían.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { makeCtx } from '@tests/support/ctx';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { warehouses } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  createCatalogDeps,
  defaultWarehouseSetupStep,
  getDefaultWarehouse,
} from '@/modules/catalog';
import { createPlatformStore, createTenant, type PlatformDeps } from '@/modules/identity';
import type { PlatformCtx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import {
  capturePgError,
  createIdentityFixtures,
  randomEmail,
  randomSlug,
} from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let platformCtx: PlatformCtx;

beforeAll(async () => {
  const admin = await fx.user();
  await fx.platformAdmin(admin.id);
  platformCtx = { userId: admin.id, requestId: 'req-warehouse' };
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

function deps(): PlatformDeps {
  return {
    store: createPlatformStore([defaultWarehouseSetupStep], getDbAdmin()),
    mailer: { send: () => Promise.resolve({ messageId: 'm' }) },
    clock: new FixedClock(new Date()),
    logger: new CapturingLogger(),
    client: UNKNOWN_CLIENT,
    afterCommit: () => undefined,
    appUrl: 'http://localhost:3000',
  };
}

async function warehousesOf(tenantId: string) {
  return getDbAdmin().select().from(warehouses).where(eq(warehouses.tenantId, tenantId));
}

describe('paso de alta', () => {
  it('createTenant deja exactamente un almacén PRINCIPAL por defecto, solo en el tenant nuevo', async () => {
    const first = await createTenant(
      platformCtx,
      {
        name: 'Cliente A',
        slug: randomSlug(),
        planCode: 'starter',
        maxUsers: null,
        currency: 'PEN',
        adminEmail: randomEmail(),
      },
      deps(),
    );
    fx.trackTenant(first.tenantId);
    const second = await createTenant(
      platformCtx,
      {
        name: 'Cliente B',
        slug: randomSlug(),
        planCode: 'starter',
        maxUsers: null,
        currency: 'PEN',
        adminEmail: randomEmail(),
      },
      deps(),
    );
    fx.trackTenant(second.tenantId);

    for (const tenantId of [first.tenantId, second.tenantId]) {
      const rows = await warehousesOf(tenantId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        code: 'PRINCIPAL',
        name: 'Almacén principal',
        isDefault: true,
        active: true,
      });
    }
  });

  it('es idempotente: correrlo otra vez no duplica ni falla', async () => {
    const tenant = await fx.tenant();
    const step = defaultWarehouseSetupStep(getDbAdmin());

    await step.run({ tenantId: tenant.id });
    await step.run({ tenantId: tenant.id });

    expect(await warehousesOf(tenant.id)).toHaveLength(1);
  });

  it('un segundo almacén por defecto del mismo tenant falla', async () => {
    const tenant = await fx.tenant();
    await defaultWarehouseSetupStep(getDbAdmin()).run({ tenantId: tenant.id });

    const error = await capturePgError(() =>
      getDbAdmin()
        .insert(warehouses)
        .values({ tenantId: tenant.id, code: 'OTRO', name: 'Otro', isDefault: true }),
    );

    expect(error.code).toBe('23505');
  });

  it('getDefaultWarehouse lo devuelve dentro del tenant y falla si no hay', async () => {
    const withWarehouse = await fx.tenant();
    const without = await fx.tenant();
    const user = await fx.user();
    await defaultWarehouseSetupStep(getDbAdmin()).run({ tenantId: withWarehouse.id });
    const read = (tenantId: string) =>
      withTenant({ tenantId, userId: user.id }, (tx) =>
        getDefaultWarehouse(
          makeCtx({ tenantId, userId: user.id, permissions: ['requests.create'] }),
          createCatalogDeps(tx, { client: UNKNOWN_CLIENT }),
        ),
      );

    expect(await read(withWarehouse.id)).toMatchObject({ code: 'PRINCIPAL' });
    await expect(read(without.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('backfill de la migración 0006', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0006_catalog_privileges.sql'),
    'utf8',
  );
  const backfill = migration.slice(migration.indexOf('insert into warehouses'));

  it('crea el almacén de un tenant existente sin almacén, sin tocar a los demás, y es idempotente', async () => {
    const legacy = await fx.tenant();
    const withDefault = await fx.tenant();
    await defaultWarehouseSetupStep(getDbAdmin()).run({ tenantId: withDefault.id });
    const before = await warehousesOf(withDefault.id);

    await getDbAdmin().execute(sql.raw(backfill));
    await getDbAdmin().execute(sql.raw(backfill));

    const created = await warehousesOf(legacy.id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ code: 'PRINCIPAL', isDefault: true });
    expect(await warehousesOf(withDefault.id)).toEqual(before);
  });
});
