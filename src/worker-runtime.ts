// Ciclo de vida del worker (ADR-001 regla 8), separado de src/worker.ts para poder probarlo.
// Crea las colas y registra los consumidores de cada historia (hoy `catalog.import`, E2-H3; los de
// E5 llegan con ella). Una cola sin consumidor real no se registra: un consumidor vacío daría por
// hechos jobs reales.
import { closeDatabases } from './db/admin';
import { getEnv } from './env';
import { createImportJobHandler } from './modules/catalog';
import { createPgBossRuntime, type JobRuntime } from './shared/adapters/pg-boss-job-queue';
import { getLogger } from './shared/adapters/pino-logger';
import { QUEUES } from './shared/ports/job-queue';

export interface RunningWorker {
  readonly runtime: JobRuntime;
  /** Idempotente: la segunda llamada no hace nada. */
  stop(): Promise<void>;
}

export async function startWorker(
  options: { schema?: string; applicationName?: string } = {},
): Promise<RunningWorker> {
  const env = getEnv();
  const logger = getLogger().child({ process: 'worker' });
  const runtime = createPgBossRuntime({
    connectionString: env.DATABASE_URL_ADMIN,
    schema: options.schema,
    applicationName: options.applicationName,
    logger,
  });

  await runtime.start();
  await runtime.ensureQueues(QUEUES);
  await runtime.work('catalog.import', createImportJobHandler({ logger }));
  logger.info({ queues: QUEUES }, 'worker started');

  let stopping: Promise<void> | undefined;
  return {
    runtime,
    stop: () => {
      stopping ??= (async () => {
        await runtime.stop();
        await closeDatabases();
        logger.info({}, 'worker stopped');
      })();
      return stopping;
    },
  };
}
