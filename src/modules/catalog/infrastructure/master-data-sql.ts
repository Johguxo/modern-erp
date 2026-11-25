// Piezas comunes de los repositorios de datos maestros (solo Drizzle; nada de reglas de negocio).
import { and, eq, ilike, or, type AnyColumn, type SQL } from 'drizzle-orm';

import { escapeLike, isUniqueViolation, searchWords, type DbExecutor } from '@/db';
import { ConflictError } from '@/shared/errors';

import type { ListFilter } from '../application/ports';

interface MasterColumns {
  readonly tenantId: AnyColumn;
  readonly code: AnyColumn;
  readonly name: AnyColumn;
  readonly active: AnyColumn;
}

/** where común: SIEMPRE el tenant; cada palabra debe aparecer en el código o en el nombre. */
export function masterWhere(columns: MasterColumns, tenantId: string, filter: ListFilter): SQL {
  const conditions: (SQL | undefined)[] = [eq(columns.tenantId, tenantId)];
  if (filter.status !== 'all') conditions.push(eq(columns.active, filter.status === 'active'));
  for (const word of searchWords(filter.q ?? '')) {
    const pattern = `%${escapeLike(word)}%`;
    conditions.push(or(ilike(columns.code, pattern), ilike(columns.name, pattern)));
  }
  return and(...conditions) as SQL;
}

/**
 * INSERT dentro de un savepoint: si el código choca, la transacción de withTenant sigue válida
 * para responder el error (code_taken) y auditar o reintentar.
 */
export async function insertOrCodeTaken<T>(
  db: DbExecutor,
  constraint: string,
  code: string,
  run: (executor: DbExecutor) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction((savepoint) => run(savepoint));
  } catch (error) {
    if (isUniqueViolation(error, constraint)) {
      throw new ConflictError({
        reason: 'code_taken',
        params: { code },
        message: `Code already exists: ${constraint}`,
      });
    }
    throw error;
  }
}
