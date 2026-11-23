// E0-H1 · `src/env.ts` valida variables con Zod y falla si falta alguna; `.env.example` completo.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEST_ENV } from '../tests/setup/test-env.mts';

import {
  envSchema,
  parseEnv,
  parseMigrationEnv,
  parseSeedEnv,
  seedEnvSchema,
  TOOLING_ONLY_KEYS,
} from './env';

const valid = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  ...TEST_ENV,
  ...overrides,
});

const without = (key: keyof typeof TEST_ENV): NodeJS.ProcessEnv => {
  const source: NodeJS.ProcessEnv = { ...TEST_ENV };
  delete source[key];
  return source;
};

describe('src/env.ts valida variables con Zod', () => {
  it('con un entorno válido devuelve los valores tipados y los valores por defecto', () => {
    const env = parseEnv(valid({ REMINDER_HOURS: undefined, RESEND_API_KEY: undefined }));

    expect(env.SESSION_SECRET).toBe(TEST_ENV.SESSION_SECRET);
    expect(env.DATABASE_URL).toBe(TEST_ENV.DATABASE_URL);
    expect(env.REMINDER_HOURS).toBe(24);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('convierte REMINDER_HOURS "48" en el número 48', () => {
    expect(parseEnv(valid({ REMINDER_HOURS: '48' })).REMINDER_HOURS).toBe(48);
  });

  it('REMINDER_HOURS no positivo falla', () => {
    expect(() => parseEnv(valid({ REMINDER_HOURS: '0' }))).toThrow(/REMINDER_HOURS/);
  });
});

describe('falla al arrancar si falta alguna variable', () => {
  it('si falta SESSION_SECRET lanza un error que la nombra', () => {
    expect(() => parseEnv(without('SESSION_SECRET'))).toThrow(/SESSION_SECRET/);
  });

  it.each([
    'APP_URL',
    'SESSION_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DATABASE_URL_ADMIN',
    'MAIL_FROM',
  ] as const)('si %s está vacía ("KEY=") cuenta como faltante', (key) => {
    expect(() => parseEnv(valid({ [key]: '' }))).toThrow(new RegExp(`${key}:`));
  });

  it('SESSION_SECRET de 31 caracteres falla', () => {
    expect(() => parseEnv(valid({ SESSION_SECRET: 'a'.repeat(31) }))).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv(valid({ SESSION_SECRET: 'a'.repeat(32) }))).not.toThrow();
  });

  it.each(['DATABASE_URL', 'DATABASE_URL_ADMIN'] as const)(
    '%s con http:// falla (debe ser postgres:// o postgresql://)',
    (key) => {
      expect(() => parseEnv(valid({ [key]: 'http://127.0.0.1:54322/postgres' }))).toThrow(
        new RegExp(key),
      );
      expect(() => parseEnv(valid({ [key]: 'postgres://u:p@127.0.0.1:5432/db' }))).not.toThrow();
    },
  );

  it('MAIL_FROM sin el formato "Nombre <correo>" falla', () => {
    expect(() => parseEnv(valid({ MAIL_FROM: 'notificaciones@linkus.pe' }))).toThrow(/MAIL_FROM/);
  });

  it('RESEND_API_KEY y SENTRY_DSN vacías pasan (son opcionales)', () => {
    const env = parseEnv(valid({ RESEND_API_KEY: '', SENTRY_DSN: '' }));
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('el mensaje de error nombra la variable pero nunca muestra valores del entorno', () => {
    const secret = 'SECRETO-RECONOCIBLE-123';
    const badUrl = 'http://usuario:clave-filtrada@host/db';
    let message = '';
    try {
      parseEnv(valid({ SESSION_SECRET: secret, DATABASE_URL: badUrl }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/SESSION_SECRET/);
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(secret);
    expect(message).not.toContain('clave-filtrada');
    for (const value of Object.values(TEST_ENV)) {
      expect(message).not.toContain(value);
    }
  });
});

describe('variables del seed', () => {
  it('parseSeedEnv sin variables falla y nombra las faltantes', () => {
    expect(() => parseSeedEnv({})).toThrow(/SEED_SUPERADMIN_EMAIL[\s\S]*SEED_DEFAULT_PASSWORD/);
  });

  it('parseSeedEnv con variables válidas pasa', () => {
    expect(
      parseSeedEnv({
        SEED_SUPERADMIN_EMAIL: 'admin@linkus.pe',
        SEED_DEFAULT_PASSWORD: 'contrasena-de-prueba',
      }),
    ).toEqual({
      SEED_SUPERADMIN_EMAIL: 'admin@linkus.pe',
      SEED_DEFAULT_PASSWORD: 'contrasena-de-prueba',
    });
  });
});

describe('variables de las migraciones (E0-H2)', () => {
  it('parseMigrationEnv pasa con solo DATABASE_URL_ADMIN', () => {
    expect(parseMigrationEnv({ DATABASE_URL_ADMIN: TEST_ENV.DATABASE_URL_ADMIN })).toEqual({
      DATABASE_URL_ADMIN: TEST_ENV.DATABASE_URL_ADMIN,
    });
  });

  it('parseMigrationEnv sin DATABASE_URL_ADMIN falla y la nombra', () => {
    expect(() => parseMigrationEnv({ DATABASE_URL: TEST_ENV.DATABASE_URL })).toThrow(
      /DATABASE_URL_ADMIN/,
    );
    expect(() => parseMigrationEnv({ DATABASE_URL_ADMIN: '' })).toThrow(/DATABASE_URL_ADMIN/);
  });

  it('parseMigrationEnv con DATABASE_URL_ADMIN http:// falla', () => {
    expect(() =>
      parseMigrationEnv({ DATABASE_URL_ADMIN: 'http://127.0.0.1:54322/postgres' }),
    ).toThrow(/DATABASE_URL_ADMIN/);
  });
});

describe('.env.example completo', () => {
  it('declara exactamente las variables de envSchema, seedEnvSchema y las de herramientas', () => {
    const example = readFileSync(path.resolve(import.meta.dirname, '../.env.example'), 'utf8');
    const keys = example
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
      .filter((key): key is string => key !== undefined);

    const expected = [
      ...Object.keys(envSchema.shape).filter((key) => key !== 'NODE_ENV'),
      ...Object.keys(seedEnvSchema.shape),
      ...TOOLING_ONLY_KEYS,
    ];

    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...expected].sort());
  });
});
