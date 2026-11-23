import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

import { parseMigrationEnv } from './src/env';

// drizzle-kit no carga .env.local: si la variable no viene del entorno (CI), se lee de ahí.
if (!process.env.DATABASE_URL_ADMIN && existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

const { DATABASE_URL_ADMIN } = parseMigrationEnv(process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: DATABASE_URL_ADMIN },
  casing: 'snake_case',
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});
