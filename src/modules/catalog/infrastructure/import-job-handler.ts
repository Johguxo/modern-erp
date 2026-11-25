// Consumidor de la cola `catalog.import` (E2-H3). Reconstruye el Ctx desde la base (no hay sesión),
// y hace el upsert y el cierre del trabajo en UNA transacción withTenant. Nunca relanza: ante
// cualquier error el trabajo queda `failed` y el job de la cola termina bien (sin reintentos).
// El contenido del archivo nunca va a los logs: de un error solo se registra su nombre y SQLSTATE.
import { z } from 'zod';

import { pgErrorCode, withTenant } from '@/db';
import { createSessionServices, resolveJobCtx } from '@/modules/identity';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';
import type { JobHandler } from '@/shared/ports/job-queue';
import type { Logger } from '@/shared/ports/logger';

import { failImportJob, processImportJob } from '../application/process-import-job';

import { createImportProcessDeps } from './import-deps';

/** Lo que el caso de uso de confirmar manda a la cola. */
const queuePayloadSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  jobId: z.uuid(),
  requestId: z.string().optional(),
});

function safeError(error: unknown): { errorName: string; pgCode: string | undefined } {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    pgCode: pgErrorCode(error),
  };
}

export function createImportJobHandler(options: { logger: Logger }): JobHandler {
  return async (job) => {
    const logger = options.logger.child({ queueJobId: job.id, queue: 'catalog.import' });
    const parsed = queuePayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      logger.error({}, 'import job ignored: invalid queue payload');
      return;
    }
    const { tenantId, userId, jobId } = parsed.data;
    const scope = { tenantId, userId };
    const log = logger.child({ importJobId: jobId, tenantId });
    const client = UNKNOWN_CLIENT;

    try {
      const ctx = await resolveJobCtx(
        { userId, tenantId, requestId: parsed.data.requestId ?? job.id },
        createSessionServices(),
      );
      const outcome = await withTenant(scope, (tx) =>
        processImportJob(ctx, { tenantId, jobId }, createImportProcessDeps(tx, { client })),
      );
      log.info(
        {
          status: outcome.status,
          ...(outcome.status === 'failed' ? { reason: outcome.reason } : {}),
        },
        'import job finished',
      );
    } catch (error) {
      log.error(safeError(error), 'import job failed');
      try {
        await withTenant(scope, (tx) =>
          failImportJob(
            { tenantId, jobId, reason: 'unexpected' },
            createImportProcessDeps(tx, { client }),
          ),
        );
      } catch (markError) {
        log.error(safeError(markError), 'import job could not be marked as failed');
      }
    }
  };
}
