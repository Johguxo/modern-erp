// E1-H5 · Configuración de la empresa con la base real (withTenant, RLS): guardar y leer la marca,
// aislamiento entre dos tenants, brand inválido leído con los valores por defecto y el adaptador
// de Supabase Storage (si el Storage local está levantado; en CI solo corre Postgres).
import { randomUUID } from 'node:crypto';

import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '@/db';
import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, tenantSettings } from '@/db/schema';
import {
  createSettingsDeps,
  getCompanyBrand,
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  type SettingsExtras,
} from '@/modules/identity';
import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { createSupabaseFileStorage } from '@/shared/adapters/supabase-file-storage';
import type { Ctx } from '@/shared/context';
import type { PublicFileStorage } from '@/shared/ports/file-storage';

import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** Storage en memoria para las pruebas de base de datos. */
function memoryStorage(): PublicFileStorage & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    put: ({ tenantId, key }) => {
      keys.push(`${tenantId}/${key}`);
      return Promise.resolve();
    },
    remove: () => Promise.resolve(),
    getSignedUrl: () => Promise.resolve('signed'),
    publicUrl: ({ tenantId, key }) => `https://storage.test/${tenantId}/${key}`,
  };
}

function extras(storage: PublicFileStorage = memoryStorage()): SettingsExtras {
  return {
    storage,
    ids: cryptoIdGenerator,
    logger: new CapturingLogger(),
    client: { ip: '198.51.100.50', userAgent: 'vitest-settings' },
    afterCommit: () => undefined,
  };
}

let ctxA: Ctx;
let ctxB: Ctx;

beforeAll(async () => {
  for (const assign of [
    (c: Ctx) => {
      ctxA = c;
    },
    (c: Ctx) => {
      ctxB = c;
    },
  ]) {
    const tenant = await fx.tenant({ name: `Legal ${randomUUID().slice(0, 6)}` });
    await fx.settings(tenant.id);
    await fx.subscription(tenant.id, 'starter');
    const user = await fx.user();
    await fx.membership(tenant.id, user.id, { roles: ['admin'] });
    assign(
      makeCtx({
        tenantId: tenant.id,
        userId: user.id,
        roles: ['admin'],
        permissions: ['settings.manage'],
      }),
    );
  }
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('updateCompanySettings + getCompanySettings', () => {
  it('guarda nombre, color y moneda; audita con el usuario del ctx', async () => {
    const result = await withTenant(ctxA, (tx) =>
      updateCompanySettings(
        ctxA,
        { displayName: 'Marca A', primaryColor: '#0A7C6E', currency: 'USD' },
        createSettingsDeps(tx, extras()),
      ),
    );
    expect(result).toEqual({ changed: true });

    const view = await withTenant(ctxA, (tx) =>
      getCompanySettings(ctxA, createSettingsDeps(tx, extras())),
    );
    expect(view).toMatchObject({
      displayName: 'Marca A',
      customDisplayName: 'Marca A',
      primaryColor: '#0A7C6E',
      currency: 'USD',
      logoUrl: null,
    });

    const [event] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, ctxA.tenantId));
    expect(event).toMatchObject({
      action: 'tenant_settings.updated',
      actorUserId: ctxA.userId,
      actorType: 'user',
    });
  });

  it('subir el logo no pisa el resto de la marca y guardar los datos no pisa el logo', async () => {
    const storage = memoryStorage();
    await withTenant(ctxA, (tx) =>
      uploadCompanyLogo(ctxA, { bytes: PNG }, createSettingsDeps(tx, extras(storage))),
    );
    expect(storage.keys[0]).toMatch(
      new RegExp(`^${ctxA.tenantId}/brand/logo-[0-9a-f-]{36}\\.png$`),
    );

    await withTenant(ctxA, (tx) =>
      updateCompanySettings(
        ctxA,
        { displayName: 'Marca A2', primaryColor: '#0A7C6E', currency: 'USD' },
        createSettingsDeps(tx, extras(storage)),
      ),
    );
    const brand = await withTenant(ctxA, (tx) =>
      getCompanyBrand(ctxA, createSettingsDeps(tx, extras(storage))),
    );
    expect(brand.displayName).toBe('Marca A2');
    expect(brand.logoUrl).toContain(`${ctxA.tenantId}/brand/logo-`);
  });

  it('aislamiento: con el ctx de B no se lee ni se modifica la marca de A', async () => {
    const before = await getDbAdmin()
      .select({ brand: tenantSettings.brand })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, ctxA.tenantId));

    // B lee su propia marca (sin nombre propio → nombre legal), no la de A.
    const brandB = await withTenant(ctxB, (tx) =>
      getCompanyBrand(ctxB, createSettingsDeps(tx, extras())),
    );
    expect(brandB.displayName).not.toContain('Marca A');

    // Un ctx "falso" con tenantId A dentro de la transacción de B: RLS no deja ver la fila.
    const forged = { ...ctxB, tenantId: ctxA.tenantId };
    await expect(
      withTenant(ctxB, (tx) =>
        updateCompanySettings(
          forged,
          { displayName: 'Hackeada', primaryColor: null, currency: 'PEN' },
          createSettingsDeps(tx, extras()),
        ),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const after = await getDbAdmin()
      .select({ brand: tenantSettings.brand })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, ctxA.tenantId));
    expect(after).toEqual(before);
  });

  it('un brand inválido en la base se lee con los valores por defecto', async () => {
    await getDbAdmin()
      .update(tenantSettings)
      .set({
        brand: { displayName: 'x', primaryColor: 'red;background:url(x)', logoPath: '../a.png' },
      })
      .where(eq(tenantSettings.tenantId, ctxB.tenantId));
    const brand = await withTenant(ctxB, (tx) =>
      getCompanyBrand(ctxB, createSettingsDeps(tx, extras())),
    );
    expect(brand.primaryColor).toBeNull();
    expect(brand.logoUrl).toBeNull();
    expect(brand.displayName).toMatch(/^Legal /);
  });
});

// El Storage local solo está en el entorno de desarrollo (CI levanta solo Postgres) y la clave de
// servicio real llega por process.env (TEST_ENV trae una ficticia): si falta algo, se omite.
async function storageAvailable(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/storage/v1/bucket/brand-assets`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    return response.ok;
  } catch {
    return false;
  }
}

const hasStorage = await storageAvailable();

describe.skipIf(!hasStorage)('Supabase Storage (bucket brand-assets)', () => {
  it('sube, sirve por URL pública con su content-type y borra', async () => {
    const storage = createSupabaseFileStorage({ bucket: 'brand-assets' });
    const tenantId = randomUUID();
    const key = `brand/logo-${randomUUID()}.png`;

    await storage.put({ tenantId, key, body: PNG, contentType: 'image/png' });
    const url = storage.publicUrl({ tenantId, key });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');

    await storage.remove({ tenantId, key });
    expect((await fetch(url)).ok).toBe(false);
  });

  it('el bucket rechaza tipos no permitidos (segunda defensa)', async () => {
    const storage = createSupabaseFileStorage({ bucket: 'brand-assets' });
    await expect(
      storage.put({
        tenantId: randomUUID(),
        key: `brand/logo-${randomUUID()}.png`,
        body: new TextEncoder().encode('<svg/>'),
        contentType: 'image/svg+xml',
      }),
    ).rejects.toThrow('Storage upload failed');
  });
});
