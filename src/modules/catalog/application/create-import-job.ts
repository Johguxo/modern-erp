// Confirmar una importación (E2-H3, catalog.manage): recibe las filas que el servidor acaba de leer
// del archivo (el cliente nunca manda filas), las valida de nuevo, guarda las filas SIN validar en
// el payload del trabajo y lo encola después del commit. Si el encolado falla, el trabajo queda pendiente (la pantalla lo
// muestra como "no se pudo iniciar" y el usuario vuelve a subir el archivo).
import type { Ctx } from '@/shared/context';
import { ValidationError } from '@/shared/errors';

import { IMPORT_LIMITS } from '../domain/import';

import type { ImportCreateDeps } from './import-ports';
import { requireCatalogWrite } from './master-data';
import { validateImportInput } from './preview-import';
import type { ImportRowsInput } from './read-import-rows';

/** Tiempo máximo que un trabajo encolado puede repetirse con la misma clave (no se reintenta). */
const SINGLETON_SECONDS = 3600;

export async function createImportJob(
  ctx: Ctx,
  input: ImportRowsInput,
  deps: ImportCreateDeps,
): Promise<{ jobId: string; queued: boolean }> {
  requireCatalogWrite(ctx);
  const { defaultCurrency, validation } = await validateImportInput(ctx, input, deps);
  if (validation.valid.length === 0) {
    throw new ValidationError({
      reason: 'no_valid_rows',
      message: 'Import file has no valid rows',
    });
  }

  const payload = { kind: input.kind, defaultCurrency, rows: input.rows };
  // El tamaño en bytes del JSON (no del archivo): un tope para que la fila de import_jobs no crezca.
  if (Buffer.byteLength(JSON.stringify(payload)) > IMPORT_LIMITS.maxPayloadBytes) {
    throw new ValidationError({ reason: 'file_too_large', message: 'Import payload too large' });
  }

  const { id } = await deps.importJobs.create(ctx.tenantId, {
    kind: input.kind,
    createdBy: ctx.userId,
    payload,
  });

  deps.afterCommit(async () => {
    await deps.queue.enqueue(
      'catalog.import',
      { tenantId: ctx.tenantId, userId: ctx.userId, jobId: id, requestId: ctx.requestId },
      { singletonKey: id, singletonSeconds: SINGLETON_SECONDS },
    );
    return { queued: true };
  });
  return { jobId: id, queued: false };
}
