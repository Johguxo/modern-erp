// E1-H5 · Configuración de la empresa con fakes: permiso, auditoría solo de lo que cambió, el
// logo se sube antes de guardar la ruta y el anterior se borra después del commit.
import { makeCtx, TEST_TENANT_ID, TEST_USER_ID } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import {
  SequentialIdGenerator,
  sequentialUuid,
} from '@tests/support/fakes/sequential-id-generator';
import { describe, expect, it } from 'vitest';

import { isDomainError } from '@/shared/errors';
import type { AfterCommitTask } from '@/shared/ports/after-commit';

import type { Brand } from '../domain/company-brand';

import { removeCompanyLogo, uploadCompanyLogo } from './company-logo';
import { getCompanyBrand, getCompanySettings } from './company-settings';
import type { Currency, SettingsDeps } from './settings-ports';
import { updateCompanySettings } from './update-company-settings';
import type { AuditEntry } from './user-admin-ports';

const admin = makeCtx({ roles: ['admin'], permissions: ['settings.manage'] });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const OLD_LOGO = `brand/logo-${sequentialUuid(99)}.png`;

function fake(initial: { brand?: Brand; currency?: Currency } = {}) {
  const state = { brand: initial.brand ?? {}, currency: initial.currency ?? 'PEN' };
  const calls: string[] = [];
  const audit: AuditEntry[] = [];
  const tasks: AfterCommitTask[] = [];
  const deps: SettingsDeps = {
    settings: {
      get: () => Promise.resolve({ legalName: 'Genrent S.A.C.', ...state }),
      lock: () => {
        calls.push('lock');
        return Promise.resolve({ ...state, brand: { ...state.brand } });
      },
      update: (_tenantId, input) => {
        calls.push('update');
        state.brand = input.brand;
        state.currency = input.currency;
        return Promise.resolve();
      },
    },
    storage: {
      put: ({ key, contentType }) => {
        calls.push(`put:${key}:${contentType}`);
        return Promise.resolve();
      },
      remove: ({ key }) => {
        calls.push(`remove:${key}`);
        return Promise.resolve();
      },
      getSignedUrl: () => Promise.resolve('signed'),
      publicUrl: ({ tenantId, key }) => `https://storage.test/${tenantId}/${key}`,
    },
    audit: {
      record: (entry) => {
        audit.push(entry);
        return Promise.resolve();
      },
    },
    ids: new SequentialIdGenerator(),
    logger: new CapturingLogger(),
    client: { ip: '203.0.113.9', userAgent: 'vitest' },
    afterCommit: (task) => tasks.push(task),
  };
  return {
    deps,
    state,
    calls,
    audit,
    runAfterCommit: async () => {
      for (const task of tasks.splice(0)) await task();
    },
  };
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isDomainError(error)) throw new Error(`Se esperaba un DomainError: ${String(error)}`);
  return error;
}

describe('lecturas', () => {
  it('sin nombre propio muestra el legal; la URL del logo sale del Storage', async () => {
    const f = fake({ brand: { primaryColor: '#0A7C6E', logoPath: OLD_LOGO } });
    expect(await getCompanyBrand(makeCtx(), f.deps)).toEqual({
      displayName: 'Genrent S.A.C.',
      primaryColor: '#0A7C6E',
      logoUrl: `https://storage.test/${TEST_TENANT_ID}/${OLD_LOGO}`,
      currency: 'PEN',
    });
  });

  it('getCompanySettings exige settings.manage', async () => {
    const f = fake();
    expect((await errorOf(getCompanySettings(makeCtx(), f.deps))).code).toBe('FORBIDDEN');
    expect(await getCompanySettings(admin, f.deps)).toMatchObject({
      customDisplayName: null,
      legalName: 'Genrent S.A.C.',
      currency: 'PEN',
    });
  });
});

describe('updateCompanySettings', () => {
  it('guarda, conserva el logo y audita solo lo que cambió', async () => {
    const f = fake({ brand: { logoPath: OLD_LOGO } });

    const result = await updateCompanySettings(
      admin,
      { displayName: 'Genrent', primaryColor: '#0A7C6E', currency: 'PEN' },
      f.deps,
    );

    expect(result).toEqual({ changed: true });
    expect(f.state.brand).toEqual({
      logoPath: OLD_LOGO,
      displayName: 'Genrent',
      primaryColor: '#0A7C6E',
    });
    expect(f.audit).toEqual([
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        actorUserId: TEST_USER_ID,
        action: 'tenant_settings.updated',
        data: {
          changes: {
            displayName: { from: null, to: 'Genrent' },
            primaryColor: { from: null, to: '#0A7C6E' },
          },
        },
      }),
    ]);
  });

  it('null quita el nombre o el color propio', async () => {
    const f = fake({ brand: { displayName: 'X Y', primaryColor: '#000000' } });
    await updateCompanySettings(
      admin,
      { displayName: null, primaryColor: null, currency: 'USD' },
      f.deps,
    );
    expect(f.state).toEqual({ brand: {}, currency: 'USD' });
  });

  it('sin cambios → no escribe ni audita', async () => {
    const f = fake({ brand: { displayName: 'Genrent' } });
    const result = await updateCompanySettings(
      admin,
      { displayName: 'Genrent', primaryColor: null, currency: 'PEN' },
      f.deps,
    );
    expect(result).toEqual({ changed: false });
    expect(f.calls).toEqual(['lock']);
    expect(f.audit).toHaveLength(0);
  });

  it('sin settings.manage → FORBIDDEN sin tocar nada', async () => {
    const f = fake();
    const error = await errorOf(
      updateCompanySettings(
        makeCtx(),
        { displayName: null, primaryColor: null, currency: 'USD' },
        f.deps,
      ),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(f.calls).toHaveLength(0);
  });
});

describe('uploadCompanyLogo', () => {
  it('sube con el tipo detectado, guarda la ruta, audita y borra el anterior después del commit', async () => {
    const f = fake({ brand: { logoPath: OLD_LOGO } });

    const result = await uploadCompanyLogo(admin, { bytes: PNG }, f.deps);

    const key = `brand/logo-${sequentialUuid(1)}.png`;
    expect(f.calls).toEqual(['lock', `put:${key}:image/png`, 'update']);
    expect(f.state.brand.logoPath).toBe(key);
    expect(result.logoUrl).toBe(`https://storage.test/${TEST_TENANT_ID}/${key}`);
    expect(f.audit[0]).toMatchObject({
      action: 'tenant_settings.logo_updated',
      data: { from: OLD_LOGO, to: key, contentType: 'image/png', sizeBytes: PNG.byteLength },
    });

    await f.runAfterCommit();
    expect(f.calls.at(-1)).toBe(`remove:${OLD_LOGO}`);
  });

  it('SVG o bytes desconocidos → logo_invalid_type, sin subir nada', async () => {
    const f = fake();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const error = await errorOf(uploadCompanyLogo(admin, { bytes: svg }, f.deps));
    expect(error).toMatchObject({ code: 'VALIDATION', reason: 'logo_invalid_type' });
    expect(f.calls).toHaveLength(0);
  });

  it('más de 512 KB → logo_too_large', async () => {
    const f = fake();
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(PNG);
    const error = await errorOf(uploadCompanyLogo(admin, { bytes: big }, f.deps));
    expect(error.reason).toBe('logo_too_large');
    expect(f.calls).toHaveLength(0);
  });

  it('si guardar falla, no se programa ningún borrado', async () => {
    const f = fake({ brand: { logoPath: OLD_LOGO } });
    f.deps.settings.update = () => Promise.reject(new Error('db down'));
    await expect(uploadCompanyLogo(admin, { bytes: PNG }, f.deps)).rejects.toThrow('db down');
    await f.runAfterCommit();
    expect(f.calls.some((c) => c.startsWith('remove:'))).toBe(false);
  });

  it('sin settings.manage → FORBIDDEN', async () => {
    const f = fake();
    expect((await errorOf(uploadCompanyLogo(makeCtx(), { bytes: PNG }, f.deps))).code).toBe(
      'FORBIDDEN',
    );
  });
});

describe('removeCompanyLogo', () => {
  it('quita la ruta, audita y borra el archivo después del commit', async () => {
    const f = fake({ brand: { logoPath: OLD_LOGO, displayName: 'Genrent' } });
    expect(await removeCompanyLogo(admin, {}, f.deps)).toEqual({ changed: true });
    expect(f.state.brand).toEqual({ displayName: 'Genrent' });
    expect(f.audit[0]).toMatchObject({
      action: 'tenant_settings.logo_removed',
      data: { from: OLD_LOGO },
    });
    await f.runAfterCommit();
    expect(f.calls.at(-1)).toBe(`remove:${OLD_LOGO}`);
  });

  it('sin logo → changed false', async () => {
    const f = fake();
    expect(await removeCompanyLogo(admin, {}, f.deps)).toEqual({ changed: false });
    expect(f.audit).toHaveLength(0);
  });
});
