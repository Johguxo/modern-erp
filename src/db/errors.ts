// Ayudas para traducir errores de Postgres en los repositorios (nunca en src/app).
// Ejemplo: `if (isUniqueViolation(err, 'products_tenant_code_key')) throw new ConflictError(...)`.

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

interface PgErrorFields {
  code?: string;
  constraint?: string;
}

/** Primer objeto de la cadena `cause` que tiene SQLSTATE (Drizzle envuelve el error del driver). */
function findPgError(error: unknown): PgErrorFields | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && typeof current.code === 'string') {
      const fields = current as { code: string; constraint_name?: unknown; constraint?: unknown };
      const constraint = fields.constraint_name ?? fields.constraint;
      return {
        code: fields.code,
        constraint: typeof constraint === 'string' ? constraint : undefined,
      };
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/** Código SQLSTATE de un error de postgres-js (envuelto o no por Drizzle). */
export function pgErrorCode(error: unknown): string | undefined {
  return findPgError(error)?.code;
}

/** Violación de clave única, opcionalmente de un constraint concreto. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const found = findPgError(error);
  if (found?.code !== PG_UNIQUE_VIOLATION) return false;
  return constraint === undefined || found.constraint === constraint;
}
