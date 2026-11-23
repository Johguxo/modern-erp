import path from 'node:path';

import { defineConfig } from 'vitest/config';

import { TEST_ENV } from './tests/setup/test-env.mts';

const alias = { '@': path.resolve(import.meta.dirname, 'src') };

/** DATABASE_URL y DATABASE_URL_ADMIN de process.env, si vienen, mandan sobre TEST_ENV. */
function databaseOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const key of ['DATABASE_URL', 'DATABASE_URL_ADMIN'] as const) {
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
          include: ['src/**/*.test.{ts,tsx}', 'tests/tooling/**/*.test.ts'],
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
