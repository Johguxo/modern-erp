// E1-H5 · Ruta de los archivos en Storage: siempre dentro de la carpeta del tenant.
import { describe, expect, it } from 'vitest';

import { objectPath } from './supabase-file-storage';

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
