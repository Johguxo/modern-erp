// Procesa un trabajo de importación (E2-H3) dentro de UNA transacción withTenant del worker: bloquea
// el trabajo, valida cada fila, hace el upsert por lotes, guarda el resumen y los errores, borra
// el payload y escribe un solo evento de auditoría. Si algo lanza, la transacción se revierte y el
// handler deja el trabajo en `failed` (sin reintentos).
import { recordAudit } from '@/modules/identity';
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { importPayloadSchema, type ImportSummary } from '../contracts/import';
import { IMPORT_LIMITS, type ImportKind } from '../domain/import';

import type { ImportProcessDeps, UpsertManyResult } from './import-ports';
import { validateImportRows } from './import-rows';

export type ImportJobOutcome =
  | { readonly status: 'completed'; readonly summary: ImportSummary }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'skipped' };

/** El trabajo no se pudo procesar por una razón conocida (se guarda en el resumen). */
export const IMPORT_FAILURES = [
  'not_allowed',
  'tenant_read_only',
  'invalid_payload',
  'unexpected',
] as const;
export type ImportFailure = (typeof IMPORT_FAILURES)[number];

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function add(total: UpsertManyResult, part: UpsertManyResult): UpsertManyResult {
  return {
    created: total.created + part.created,
    updated: total.updated + part.updated,
    unchanged: total.unchanged + part.unchanged,
  };
}

async function upsertInBatches(
  kind: ImportKind,
  tenantId: string,
  validation: ReturnType<typeof validateImportRows>,
  deps: ImportProcessDeps,
): Promise<UpsertManyResult> {
  let total: UpsertManyResult = { created: 0, updated: 0, unchanged: 0 };
  if (kind === 'products') {
    const rows = validation.valid as Parameters<typeof deps.products.upsertManyByCode>[1];
    for (const batch of chunks(rows, IMPORT_LIMITS.batchSize)) {
      total = add(total, await deps.products.upsertManyByCode(tenantId, batch));
    }
  } else {
    const rows = validation.valid as Parameters<typeof deps.equipment.upsertManyByCode>[1];
    for (const batch of chunks(rows, IMPORT_LIMITS.batchSize)) {
      total = add(total, await deps.equipment.upsertManyByCode(tenantId, batch));
    }
  }
  return total;
}

/**
 * `ctx` es null si el usuario que creó el trabajo ya no está activo en la empresa
 * (resolveJobCtx): el trabajo termina `failed` con `not_allowed`.
 */
export async function processImportJob(
  ctx: Ctx | null,
  input: { readonly tenantId: string; readonly jobId: string },
  deps: ImportProcessDeps,
): Promise<ImportJobOutcome> {
  const { tenantId, jobId } = input;
  const job = await deps.importJobs.lockById(tenantId, jobId);
  // Solo se trabaja un job pendiente: una segunda entrega del mismo mensaje no hace nada.
  if (!job || job.status !== 'pending') return { status: 'skipped' };

  const rejectWith = async (reason: ImportFailure): Promise<ImportJobOutcome> => {
    await deps.importJobs.fail(tenantId, jobId, reason);
    return { status: 'failed', reason };
  };

  if (!ctx || !hasPermission(ctx, 'catalog.manage') || job.createdBy !== ctx.userId) {
    return rejectWith('not_allowed');
  }
  if (ctx.readOnly) return rejectWith('tenant_read_only');

  const payload = importPayloadSchema.safeParse(job.payload);
  if (!payload.success || payload.data.kind !== job.kind) return rejectWith('invalid_payload');
  const { kind, defaultCurrency, rows } = payload.data;

  const validation = validateImportRows(kind, rows, { defaultCurrency });
  const counts = await upsertInBatches(kind, tenantId, validation, deps);
  const summary: ImportSummary = {
    total: rows.length,
    created: counts.created,
    updated: counts.updated,
    unchanged: counts.unchanged,
    failed: validation.failedRows,
  };

  await deps.importJobs.complete(tenantId, jobId, {
    summary,
    errors: validation.errors.slice(0, IMPORT_LIMITS.maxStoredErrors),
  });
  // Sin nombres de archivo ni contenido: solo el tipo y los totales.
  await recordAudit(
    ctx,
    {
      action: 'import_job.completed',
      entityType: 'import_job',
      entityId: jobId,
      data: { kind, summary },
    },
    deps,
  );
  return { status: 'completed', summary };
}

/** Marca el trabajo como fallido tras un error inesperado (en una transacción nueva). */
export async function failImportJob(
  input: { readonly tenantId: string; readonly jobId: string; readonly reason: ImportFailure },
  deps: Pick<ImportProcessDeps, 'importJobs'>,
): Promise<void> {
  const job = await deps.importJobs.lockById(input.tenantId, input.jobId);
  if (!job || job.status !== 'pending') return;
  await deps.importJobs.fail(input.tenantId, input.jobId, input.reason);
}
