import path from 'node:path';

import { defineConfig } from 'vitest/config';

import { TEST_ENV } from './tests/setup/test-env.mts';

const alias = {
  '@tests': path.resolve(import.meta.dirname, 'tests'),
  '@': path.resolve(import.meta.dirname, 'src'),
};

/**
 * DATABASE_URL, DATABASE_URL_ADMIN y SUPABASE_SERVICE_ROLE_KEY de process.env, si vienen, mandan
 * sobre TEST_ENV (la clave permite probar el adaptador de Storage contra Supabase local).
 */
function databaseOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const key of ['DATABASE_URL', 'DATABASE_URL_ADMIN', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
    const value = process.env[key];
    if (value) overrides[key] = value;
  }
  return overrides;
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/**/*.test.{ts,tsx}',
            'tests/tooling/**/*.test.ts',
            'tests/support/**/*.test.ts',
          ],
          env: TEST_ENV,
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Supabase local por defecto; CI u otra base pueden sobrescribir las URLs desde process.env.
          env: { ...TEST_ENV, ...databaseOverrides() },
          globalSetup: ['tests/setup/integration-global-setup.mts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
