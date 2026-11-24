// E1-H5 · Ruta de los archivos en Storage: siempre dentro de la carpeta del tenant.
import { describe, expect, it } from 'vitest';

import { createSupabaseFileStorage, objectPath } from './supabase-file-storage';

const TENANT = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('objectPath', () => {
  it('antepone el tenant', () => {
    expect(objectPath(TENANT, 'brand/logo-abc.png')).toBe(`${TENANT}/brand/logo-abc.png`);
  });

  it.each([
    '../otro/logo.png',
    'brand/../../x.png',
    '/brand/logo.png',
    'brand\\logo.png',
    'brand//logo.png',
    'Brand/Logo.PNG',
    'brand/',
    '',
    'brand/logo .png',
  ])('rechaza la clave %j', (key) => {
    expect(() => objectPath(TENANT, key)).toThrow('Invalid storage key');
  });

  it('rechaza un tenant que no es uuid', () => {
    expect(() => objectPath('..', 'brand/logo.png')).toThrow('Invalid tenant id');
  });
});

describe('createSupabaseFileStorage', () => {
  it('sube, borra y arma la URL siempre dentro de la carpeta del tenant', async () => {
    const calls: unknown[][] = [];
    const fakeBucket = {
      upload: (...args: unknown[]) => {
        calls.push(['upload', ...args]);
        return Promise.resolve({ error: null });
      },
      remove: (...args: unknown[]) => {
        calls.push(['remove', ...args]);
        return Promise.resolve({ error: null });
      },
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'signed' }, error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
    };
    const fromCalls: string[] = [];
    const storage = createSupabaseFileStorage({
      bucket: 'brand-assets',
      client: {
        storage: {
          from: (name: string) => {
            fromCalls.push(name);
            return fakeBucket;
          },
        },
      } as unknown as Parameters<typeof createSupabaseFileStorage>[0]['client'],
    });
    const body = new Uint8Array([1]);

    await storage.put({
      tenantId: TENANT,
      key: 'brand/logo-a.png',
      body,
      contentType: 'image/png',
    });
    await storage.remove({ tenantId: TENANT, key: 'brand/logo-a.png' });
    const url = storage.publicUrl({ tenantId: TENANT, key: 'brand/logo-a.png' });

    expect(fromCalls.every((name) => name === 'brand-assets')).toBe(true);
    expect(calls[0]).toEqual([
      'upload',
      `${TENANT}/brand/logo-a.png`,
      body,
      { contentType: 'image/png', cacheControl: '31536000', upsert: false },
    ]);
    expect(calls[1]).toEqual(['remove', [`${TENANT}/brand/logo-a.png`]]);
    expect(url).toBe(`https://cdn.test/${TENANT}/brand/logo-a.png`);
    await expect(
      storage.put({ tenantId: TENANT, key: '../x.png', body, contentType: 'image/png' }),
    ).rejects.toThrow('Invalid storage key');
  });
});
