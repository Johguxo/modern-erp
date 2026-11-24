// Regla de imports prohibidos (ADR-001 reglas 2, 4 y 10; ADR-003 §Regla de imports).
// Genera bloques de flat config que no se solapan: en flat config la última definición de una
// regla reemplaza a las anteriores, así que cada archivo recibe exactamente un bloque.

/** Única fuente de la lista de módulos (ADR-001 §Estructura). */
export const MODULES = [
  'identity',
  'catalog',
  'requests',
  'approvals',
  'inventory',
  'documents',
  'notifications',
];

const ADR = 'Ver ADR-001 y ADR-003.';

const FRAMEWORK = {
  group: ['next', 'next/*', 'react', 'react/*', 'react-dom', 'react-dom/*'],
  message: `src/modules no depende de Next.js ni de React: la entrega vive en src/app. ${ADR}`,
};

const SDKS = {
  group: [
    '@supabase/*',
    'resend',
    'resend/*',
    'pg-boss',
    'pg-boss/*',
    'pino',
    'pino/*',
    'pino-pretty',
  ],
  message: `Los SDK externos solo se usan en infrastructure/ o src/shared/adapters/, detrás de un puerto. ${ADR}`,
};

// Entradas públicas de un módulo: su index.ts y, para el cliente (formularios), su carpeta
// contracts/ (solo esquemas Zod, sin base de datos). Nada más profundo.
const DEEP_MODULE_IMPORT = {
  regex: '(^|/)modules/[^/]+/(?!contracts$).+',
  message: `Otro módulo se usa solo por su index.ts (@/modules/<módulo>) o por @/modules/<módulo>/contracts, nunca por sus carpetas internas. ${ADR}`,
};

const DB_ACCESS = {
  group: ['drizzle-orm', 'drizzle-orm/*', 'postgres', '@/db', '@/db/*'],
  message: `domain/, application/, contracts/, shared/ y ui/ no acceden a la base: los repositorios viven en infrastructure/. Ver ADR-001 y ADR-004.`,
};

const DB_RELATIVE = {
  regex: '^(\\.\\./)+db(/|$)',
  message: `domain/, application/, contracts/, shared/ y ui/ no acceden a la base: los repositorios viven en infrastructure/. Ver ADR-001 y ADR-004.`,
};

const PG_DRIVER = {
  group: ['postgres'],
  message: `El driver de Postgres solo se usa en src/db; el resto usa @/db. Ver ADR-004.`,
};

const DRIZZLE = {
  group: ['drizzle-orm', 'drizzle-orm/*'],
  message: `src/app no consulta la base directamente: llama a un caso de uso. ${ADR}`,
};

const DB_ADMIN = {
  group: ['@/db/admin'],
  message: `La conexión dueño (sin RLS) solo se usa en casos de uso acotados y auditados, nunca desde src/app. Ver ADR-004.`,
};

// src/app solo puede usar @/db (withTenant/withUser para el helper action de E0-H3):
// nunca la conexión directa, el esquema ni la conexión dueño, tampoco por ruta relativa.
const APP_DB_INTERNALS = {
  group: ['@/db/client', '@/db/schema', '@/db/schema/*'],
  message: `src/app no consulta la base directamente: llama a un caso de uso (las transacciones van por withTenant). Ver ADR-001 y ADR-004.`,
};

const APP_DB_RELATIVE = {
  regex: '^(\\.\\./)+db/',
  message: `Importa la base por @/db, nunca por ruta relativa ni sus archivos internos. Ver ADR-004.`,
};

const LOWER_LAYER = {
  group: ['@/modules', '@/modules/*'],
  message: `src/db es una capa inferior: no importa módulos. ${ADR}`,
};

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function moduleRestrictions(mod, { allowSdks }) {
  const others = MODULES.filter((m) => m !== mod).map(escape);
  const patterns = [
    FRAMEWORK,
    DEEP_MODULE_IMPORT,
    {
      regex: `^(\\.\\./)+(${others.join('|')})(/|$)`,
      message: `No importes otro módulo por ruta relativa; usa @/modules/<módulo>. ${ADR}`,
    },
    {
      regex: `^@/modules/${escape(mod)}$`,
      message: `Dentro de un módulo usa imports relativos, no su propio index.ts (evita ciclos). ${ADR}`,
    },
  ];
  if (allowSdks) patterns.push(PG_DRIVER);
  else patterns.push(SDKS, DB_ACCESS, DB_RELATIVE);
  return ['error', { patterns }];
}

/** Bloques de flat config para `no-restricted-imports`. */
export const importBoundaries = [
  ...MODULES.flatMap((mod) => [
    {
      name: `import-boundaries/modules/${mod}`,
      files: [`src/modules/${mod}/**/*.{ts,tsx,mts}`],
      ignores: [`src/modules/${mod}/infrastructure/**`],
      rules: { 'no-restricted-imports': moduleRestrictions(mod, { allowSdks: false }) },
    },
    {
      name: `import-boundaries/modules/${mod}/infrastructure`,
      files: [`src/modules/${mod}/infrastructure/**/*.{ts,tsx,mts}`],
      rules: { 'no-restricted-imports': moduleRestrictions(mod, { allowSdks: true }) },
    },
  ]),
  {
    name: 'import-boundaries/db',
    files: ['src/db/**/*.{ts,tsx,mts}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [FRAMEWORK, SDKS, LOWER_LAYER] }],
    },
  },
  {
    name: 'import-boundaries/app',
    files: ['src/app/**/*.{ts,tsx,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            SDKS,
            DEEP_MODULE_IMPORT,
            PG_DRIVER,
            DRIZZLE,
            DB_ADMIN,
            APP_DB_INTERNALS,
            APP_DB_RELATIVE,
          ],
        },
      ],
    },
  },
  {
    name: 'import-boundaries/ui',
    files: ['src/ui/**/*.{ts,tsx,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [SDKS, DEEP_MODULE_IMPORT, DB_ACCESS, DB_RELATIVE] },
      ],
    },
  },
  {
    // ctx, errores y puertos: puros, sin base de datos (los adaptadores van en shared/adapters).
    name: 'import-boundaries/shared',
    files: ['src/shared/**/*.{ts,tsx,mts}'],
    ignores: ['src/shared/adapters/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [SDKS, DEEP_MODULE_IMPORT, DB_ACCESS, DB_RELATIVE] },
      ],
    },
  },
  {
    name: 'import-boundaries/src',
    files: ['src/**/*.{ts,tsx,mts}'],
    ignores: [
      'src/modules/**',
      'src/db/**',
      'src/app/**',
      'src/ui/**',
      'src/shared/**',
      'src/proxy.ts',
      'src/middleware.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SDKS, DEEP_MODULE_IMPORT, PG_DRIVER] }],
    },
  },
];
