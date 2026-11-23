// Adaptador pg-boss de los puertos JobQueue (productor) y JobConsumer (worker).
// Usa el rol dueño (DATABASE_URL_ADMIN) y su propio esquema (`pgboss`). pg-boss usa advisory
// locks: en producción la conexión debe ser directa o del pooler en modo sesión (5432).
//
// Encolar desde la web (E5): se hace DESPUÉS del commit de la transacción del request. Riesgo
// aceptado: si el proceso muere entre el commit y el envío, se pierde ese aviso (el recordatorio
// diario lo cubre). Encolar dentro de la misma transacción queda como mejora futura.
import { PgBoss } from 'pg-boss';

import { getEnv } from '../../env';
import type {
  EnqueueOptions,
  JobConsumer,
  JobHandler,
  JobPayload,
  JobQueue,
  QueueName,
} from '../ports/job-queue';
import type { Logger } from '../ports/logger';

export interface JobRuntimeOptions {
  readonly connectionString: string;
  /** Esquema de pg-boss; las pruebas usan uno propio para no chocar. */
  readonly schema?: string;
  readonly logger: Logger;
  /** Cada cuánto busca jobs nuevos cada consumidor (mínimo 0.5). */
  readonly pollingIntervalSeconds?: number;
  readonly applicationName?: string;
}

export interface JobRuntime extends JobConsumer {
  readonly queue: JobQueue;
  start(): Promise<void>;
  /** Crea las colas si no existen (sin consumidores). */
  ensureQueues(queues: readonly QueueName[]): Promise<void>;
  /** Apaga ordenadamente: espera los jobs en curso (hasta 25 s) y cierra sus conexiones. */
  stop(): Promise<void>;
}

const STOP_TIMEOUT_MS = 25_000;
const DEFAULT_SINGLETON_SECONDS = 3600;

export function createPgBossRuntime(options: JobRuntimeOptions): JobRuntime {
  const { logger } = options;
  const pollingIntervalSeconds = options.pollingIntervalSeconds ?? 2;
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: options.schema ?? 'pgboss',
    application_name: options.applicationName ?? 'linkus-worker',
  });
  // Sin este manejador, un error de pg-boss tumbaría el proceso.
  boss.on('error', (error: unknown) => logger.error({ err: error }, 'job queue error'));

  const queue: JobQueue = {
    enqueue: (name: QueueName, payload: JobPayload, enqueueOptions: EnqueueOptions = {}) =>
      boss.send(name, payload, {
        startAfter: enqueueOptions.startAfter,
        // pg-boss solo deduplica por singletonKey con una ventana (singletonSeconds) o con
        // políticas de cola que limitan toda la cola: se usa la ventana.
        ...(enqueueOptions.singletonKey
          ? {
              singletonKey: enqueueOptions.singletonKey,
              singletonSeconds: enqueueOptions.singletonSeconds ?? DEFAULT_SINGLETON_SECONDS,
            }
          : {}),
      }),
  };

  return {
    queue,
    start: async () => {
      await boss.start();
    },
    ensureQueues: async (queues) => {
      for (const name of queues) {
        if (!(await boss.getQueue(name))) await boss.createQueue(name);
      }
    },
    work: async (name: QueueName, handler: JobHandler) => {
      await boss.work<JobPayload>(name, { batchSize: 1, pollingIntervalSeconds }, async (jobs) => {
        for (const job of jobs) {
          await handler({ id: job.id, payload: job.data });
        }
      });
    },
    stop: () => boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS }),
  };
}

const globalForJobs = globalThis as typeof globalThis & { __linkusJobRuntime?: JobRuntime };

/** Runtime del proceso, perezoso (lee DATABASE_URL_ADMIN del entorno validado). */
export function getJobRuntime(logger: Logger): JobRuntime {
  globalForJobs.__linkusJobRuntime ??= createPgBossRuntime({
    connectionString: getEnv().DATABASE_URL_ADMIN,
    logger,
  });
  return globalForJobs.__linkusJobRuntime;
}

/** Apaga el runtime del proceso si se creó (worker y pruebas). */
export async function closeJobRuntime(): Promise<void> {
  const runtime = globalForJobs.__linkusJobRuntime;
  globalForJobs.__linkusJobRuntime = undefined;
  await runtime?.stop();
}
