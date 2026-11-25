// Trabajos de importación (E2-H3) con la transacción de withTenant: RLS y filtro explícito por
// tenantId. app_user solo actualiza status, summary, errors, payload, finished_at y updated_at
// (grants de 0009); no hay DELETE.
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { importJobs } from '@/db/schema';

import type {
  ImportJobRecord,
  ImportJobRepository,
  ImportJobStatus,
} from '../application/import-ports';
import { IMPORT_KINDS, type ImportKind } from '../domain/import';

/** Sin el payload: puede pesar hasta 5 MB y solo lo necesita el worker. */
const viewColumns = {
  id: importJobs.id,
  kind: importJobs.kind,
  status: importJobs.status,
  createdBy: importJobs.createdBy,
  summary: importJobs.summary,
  errors: importJobs.errors,
  createdAt: importJobs.createdAt,
  finishedAt: importJobs.finishedAt,
};
const columns = { ...viewColumns, payload: importJobs.payload };

const STATUSES: readonly ImportJobStatus[] = ['pending', 'processing', 'completed', 'failed'];

type Row = {
  id: string;
  kind: string;
  status: string;
  createdBy: string | null;
  payload: unknown;
  summary: unknown;
  errors: unknown;
  createdAt: Date;
  finishedAt: Date | null;
};

function toRecord(row: Row): ImportJobRecord | null {
  const kind = IMPORT_KINDS.find((value) => value === row.kind);
  const status = STATUSES.find((value) => value === row.status);
  // 'stock' (E6-H2) aún no se importa: no es un trabajo que esta historia pueda mostrar o procesar.
  if (!kind || !status) return null;
  return { ...row, kind: kind satisfies ImportKind, status };
}

export function createDrizzleImportJobRepository(db: DbExecutor): ImportJobRepository {
  const where = (tenantId: string, id: string) =>
    and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, id));

  return {
    async create(tenantId, input) {
      const [row] = await db
        .insert(importJobs)
        .values({
          tenantId,
          kind: input.kind,
          status: 'pending',
          createdBy: input.createdBy,
          payload: input.payload,
        })
        .returning({ id: importJobs.id });
      if (!row) throw new Error('Import job insert returned no row');
      return row;
    },

    async lockById(tenantId, id) {
      const [row] = await db
        .select(columns)
        .from(importJobs)
        .where(where(tenantId, id))
        .for('update')
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async findById(tenantId, id) {
      const [row] = await db
        .select(viewColumns)
        .from(importJobs)
        .where(where(tenantId, id))
        .limit(1);
      return row ? toRecord({ ...row, payload: null }) : null;
    },

    async complete(tenantId, id, result) {
      await db
        .update(importJobs)
        .set({
          status: 'completed',
          summary: result.summary,
          errors: result.errors,
          payload: null,
          finishedAt: new Date(),
        })
        .where(where(tenantId, id));
    },

    async fail(tenantId, id, reason) {
      await db
        .update(importJobs)
        .set({
          status: 'failed',
          summary: { failureReason: reason },
          errors: [],
          payload: null,
          finishedAt: new Date(),
        })
        .where(where(tenantId, id));
    },
  };
}
