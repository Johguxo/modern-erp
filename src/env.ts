// Configuración del proceso validada con Zod (ADR-001, regla 9). Único punto de lectura de process.env.
// Solo servidor: no lo importes desde componentes cliente.
import { z } from 'zod';

/** Convierte cadenas vacías ("KEY=" en .env) en ausentes, para que cuenten como faltantes u opcionales. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const required = <T extends z.ZodType>(schema: T) => z.preprocess(emptyAsUndefined, schema);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyAsUndefined, schema.optional());

const postgresUrl = z
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), 'debe empezar con postgres:// o postgresql://');

/** Variables que la app necesita para arrancar (web y worker). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: required(z.url()),
  SESSION_SECRET: required(z.string().min(32, 'debe tener al menos 32 caracteres')),
  NEXT_PUBLIC_SUPABASE_URL: required(z.url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required(z.string().min(1)),
  SUPABASE_SERVICE_ROLE_KEY: required(z.string().min(1)),
  DATABASE_URL: required(postgresUrl),
  DATABASE_URL_ADMIN: required(postgresUrl),
  RESEND_API_KEY: optional(z.string().min(1)),
  MAIL_FROM: required(
    z.string().regex(/^.+<[^<>\s@]+@[^<>\s@]+>$/, 'debe tener el formato "Nombre <correo>"'),
  ),
  REMINDER_HOURS: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().default(24)),
  SENTRY_DSN: optional(z.url()),
});

/** Variables que solo exige `pnpm db:seed`. */
export const seedEnvSchema = z.object({
  SEED_SUPERADMIN_EMAIL: required(z.email()),
  SEED_DEFAULT_PASSWORD: required(z.string().min(12, 'debe tener al menos 12 caracteres')),
});

/** Variables de .env.example que no lee la app (las usa el MCP de Supabase de Claude Code). */
export const TOOLING_ONLY_KEYS = ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN'] as const;

export type Env = z.infer<typeof envSchema>;
export type SeedEnv = z.infer<typeof seedEnvSchema>;

function formatIssues(error: z.ZodError): string {
  // Solo nombres y motivos: nunca valores, para no filtrar secretos en logs.
  const lines = error.issues.map((issue) => {
    const key = issue.path.join('.') || '(raíz)';
    const reason = issue.code === 'invalid_type' ? 'falta o tiene un tipo inválido' : issue.message;
    return `  - ${key}: ${reason}`;
  });
  return `Variables de entorno inválidas o faltantes:\n${lines.join('\n')}\nRevisa .env.example.`;
}

function parseWith<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(formatIssues(result.error));
  }
  return result.data;
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return parseWith(envSchema, source);
}

export function parseSeedEnv(source: NodeJS.ProcessEnv = process.env): SeedEnv {
  return parseWith(seedEnvSchema, source);
}

/** Se valida al importar: si falta una variable obligatoria, el proceso no arranca. */
export const env: Env = parseEnv(process.env);
