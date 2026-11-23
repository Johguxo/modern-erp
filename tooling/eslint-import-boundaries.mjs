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
  group: ['@supabase/*', 'resend', 'resend/*', 'pg-boss', 'pg-boss/*'],
  message: `Los SDK externos solo se usan en infrastructure/ o src/shared/adapters/, detrás de un puerto. ${ADR}`,
};

const DEEP_MODULE_IMPORT = {
  regex: '(^|/)modules/[^/]+/.+',
  message: `Otro módulo se usa solo por su index.ts (@/modules/<módulo>), nunca por sus carpetas internas. ${ADR}`,
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
  if (!allowSdks) patterns.push(SDKS);
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
    name: 'import-boundaries/src',
    files: ['src/**/*.{ts,tsx,mts}'],
    ignores: ['src/modules/**', 'src/shared/adapters/**', 'src/proxy.ts', 'src/middleware.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SDKS, DEEP_MODULE_IMPORT] }],
    },
  },
];
