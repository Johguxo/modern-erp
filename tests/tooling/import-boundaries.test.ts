// E0-H1/E0-H2 · Regla de imports prohibidos (ADR-001 / ADR-003) y prueba de que falla al violarla.
import path from 'node:path';

import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { importBoundaries } from '../../tooling/eslint-import-boundaries.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RULE = 'no-restricted-imports';

// Config mínima: solo el parser (sin información de tipos) y los bloques de la regla.
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx,mts}'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...importBoundaries,
  ],
});

async function lintImport(file: string, specifier: string) {
  const [result] = await eslint.lintText(`import '${specifier}';\n`, {
    filePath: path.join(ROOT, file),
  });
  if (!result) throw new Error(`ESLint no devolvió resultado para ${file}`);
  // Un error fatal (de parseo) no debe pasar como "import permitido".
  expect(result.messages.filter((m) => m.fatal)).toEqual([]);
  return result.messages;
}

type Case = [file: string, specifier: string];

const FORBIDDEN: Case[] = [
  // domain: sin framework, sin SDK, sin carpetas internas de otros módulos, sin su propio index
  ['src/modules/requests/domain/x.ts', 'next/headers'],
  ['src/modules/requests/domain/x.ts', 'react'],
  ['src/modules/requests/domain/x.ts', '@supabase/supabase-js'],
  ['src/modules/requests/domain/x.ts', 'resend'],
  ['src/modules/requests/domain/x.ts', 'pg-boss'],
  ['src/modules/requests/domain/x.ts', '@/modules/catalog/infrastructure/repo'],
  ['src/modules/requests/domain/x.ts', '../../catalog/domain/x'],
  ['src/modules/requests/domain/x.ts', '@/modules/requests'],
  // application y contracts tampoco dependen de Next.js
  ['src/modules/requests/application/x.ts', 'next'],
  ['src/modules/requests/contracts/x.ts', 'next'],
  // infrastructure puede usar SDK, pero no Next.js ni carpetas internas de otros módulos
  ['src/modules/requests/infrastructure/x.ts', 'next/cache'],
  ['src/modules/requests/infrastructure/x.ts', '@/modules/catalog/infrastructure/x'],
  // fuera de los módulos, los SDK solo en src/shared/adapters
  ['src/shared/context.ts', 'resend'],
  ['src/app/page.tsx', '@supabase/ssr'],
  ['src/app/page.tsx', '@/modules/requests/application/x'],
  ['src/worker.ts', 'pg-boss'],
  // E0-H2: domain, application, contracts y ui no acceden a la base (ADR-004)
  ['src/modules/requests/domain/x.ts', 'drizzle-orm'],
  ['src/modules/requests/domain/x.ts', '@/db'],
  ['src/modules/requests/domain/x.ts', 'postgres'],
  ['src/modules/requests/domain/x.ts', '../../../db/client'],
  ['src/modules/requests/application/x.ts', '@/db/with-tenant'],
  ['src/modules/requests/contracts/x.ts', 'drizzle-orm/pg-core'],
  ['src/ui/x.tsx', '@/db'],
  // el driver solo en src/db; la conexión dueño nunca desde src/app
  ['src/modules/requests/infrastructure/x.ts', 'postgres'],
  ['src/app/page.tsx', '@/db/admin'],
  ['src/app/page.tsx', 'drizzle-orm'],
  ['src/app/page.tsx', 'postgres'],
  ['src/shared/x.ts', 'postgres'],
  // src/db es una capa inferior
  ['src/db/client.ts', '@/modules/identity'],
  ['src/db/client.ts', 'next/headers'],
];

const ALLOWED: Case[] = [
  ['src/modules/requests/domain/x.ts', 'zod'],
  ['src/modules/requests/domain/x.ts', 'decimal.js'],
  ['src/modules/requests/domain/x.ts', '@/modules/catalog'],
  ['src/modules/requests/domain/x.ts', '../domain/y'],
  ['src/modules/requests/infrastructure/x.ts', '@supabase/ssr'],
  ['src/modules/requests/infrastructure/x.ts', 'pg-boss'],
  ['src/shared/adapters/mailer.ts', 'resend'],
  ['src/app/page.tsx', 'next/link'],
  ['src/app/page.tsx', '@/modules/requests'],
  ['src/proxy.ts', '@supabase/ssr'],
  ['src/middleware.ts', '@supabase/ssr'],
  ['src/modules/requests/infrastructure/x.ts', 'drizzle-orm'],
  ['src/modules/requests/infrastructure/x.ts', '@/db'],
  ['src/modules/requests/infrastructure/x.ts', '@/db/admin'],
  ['src/db/client.ts', 'postgres'],
  ['src/db/client.ts', 'drizzle-orm/postgres-js'],
  ['src/app/page.tsx', '@/db'],
];

describe('regla de imports prohibidos (no-restricted-imports por carpeta)', () => {
  it.each(FORBIDDEN)('falla al violarla: %s no puede importar %s', async (file, specifier) => {
    const messages = await lintImport(file, specifier);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.ruleId).toBe(RULE);
      expect(message.severity).toBe(2);
    }
  });

  it.each(ALLOWED)('permite el import válido: %s puede importar %s', async (file, specifier) => {
    const messages = await lintImport(file, specifier);
    expect(messages).toEqual([]);
  });
});

describe('la configuración real de ESLint aplica la regla de imports prohibidos', () => {
  let realEslint: ESLint;

  beforeAll(() => {
    realEslint = new ESLint({ cwd: ROOT });
  });

  const expectedFor = (file: string) => {
    // Último bloque de importBoundaries que aplica al archivo (mismo criterio que flat config).
    const matching = importBoundaries.filter((block) => {
      const files = (block.files ?? []) as string[];
      const ignores = block.ignores ?? [];
      return (
        files.some((glob) => path.matchesGlob(file, glob)) &&
        !ignores.some((glob) => path.matchesGlob(file, glob))
      );
    });
    const last = matching.at(-1);
    if (!last?.rules) throw new Error(`Ningún bloque de importBoundaries aplica a ${file}`);
    return last.rules[RULE];
  };

  it.each([
    'src/modules/requests/domain/x.ts',
    'src/modules/requests/infrastructure/x.ts',
    'src/app/page.tsx',
    'src/db/client.ts',
    'src/ui/x.tsx',
  ])(
    'en %s la regla es la generada por importBoundaries (nada posterior la pisa)',
    async (file) => {
      const config = (await realEslint.calculateConfigForFile(path.join(ROOT, file))) as
        Linter.Config | undefined;
      const actual = config?.rules?.[RULE];

      const expected = expectedFor(file) as [string, unknown];
      expect(actual).toBeDefined();
      // ESLint normaliza la severidad 'error' a 2.
      expect(actual).toEqual([2, expected[1]]);
    },
  );
});
