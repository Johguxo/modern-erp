// Estado y resultado de un trabajo de importación (E2-H3, catalog.manage). `stalled` se calcula al
// leer: un trabajo que lleva más de 5 minutos pendiente es uno que nadie tomó.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import {
  importSummarySchema,
  rowErrorSchema,
  type ImportSummary,
  type RowError,
} from '../contracts/import';
import type { ImportKind } from '../domain/import';

import type { ImportJobStatus, ImportQueryDeps } from './import-ports';

export const IMPORT_STALL_MS = 5 * 60 * 1000;

export interface ImportJobView {
  readonly id: string;
  readonly kind: ImportKind;
  readonly status: ImportJobStatus;
  readonly stalled: boolean;
  readonly summary: ImportSummary | null;
  readonly failureReason: string | null;
  readonly errors: RowError[];
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

function failureReasonOf(summary: unknown): string | null {
  if (typeof summary !== 'object' || summary === null || !('failureReason' in summary)) return null;
  return typeof summary.failureReason === 'string' ? summary.failureReason : null;
}

export async function getImportJob(
  ctx: Ctx,
  input: { readonly id: string },
  deps: ImportQueryDeps,
): Promise<ImportJobView> {
  requirePermission(ctx, 'catalog.manage');
  const job = await deps.importJobs.findById(ctx.tenantId, input.id);
  if (!job) throw new NotFoundError({ message: 'Import job not found' });

  const summary = importSummarySchema.safeParse(job.summary);
  const errors = rowErrorSchema.array().safeParse(job.errors);
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stalled:
      job.status === 'pending' &&
      deps.clock.now().getTime() - job.createdAt.getTime() > IMPORT_STALL_MS,
    summary: job.status === 'completed' && summary.success ? summary.data : null,
    failureReason: job.status === 'failed' ? (failureReasonOf(job.summary) ?? 'unexpected') : null,
    errors: errors.success ? errors.data : [],
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
