// Adaptador pg-boss de los puertos JobQueue (productor) y JobConsumer (worker).
// Usa el rol dueño (DATABASE_URL_ADMIN) y su propio esquema (`pgboss`). pg-boss usa advisory
// locks: en producción la conexión debe ser directa o del pooler en modo sesión (5432).
//
// Encolar desde la web: se hace DESPUÉS del commit de la transacción del request. Riesgo
// aceptado: si el proceso muere entre el commit y el envío, se pierde ese aviso (el recordatorio
// diario lo cubre). Encolar dentro de la misma transacción queda como mejora futura.
import { PgBoss } from 'pg-boss';

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
        // pg-boss 12 solo deduplica por singletonKey con singletonSeconds (franjas fijas).
        singletonKey: enqueueOptions.singletonKey,
        singletonSeconds: enqueueOptions.singletonSeconds,
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

export interface JobProducerOptions {
  readonly connectionString: string;
  readonly schema?: string;
  readonly logger: Logger;
  readonly applicationName?: string;
}

export interface JobProducer extends JobQueue {
  /** Cierra la conexión (si llegó a abrirse). Idempotente. */
  stop(): Promise<void>;
}

/**
 * Productor de solo envío para la web (E2-H3): una instancia por proceso, perezosa (no conecta
 * hasta el primer envío), sin supervise, sin schedule, sin migraciones y con un pool chico. El
 * esquema y las colas los crea el worker al arrancar (`ensureQueues`); si aún no existen, el envío
 * falla y el trabajo queda pendiente (la pantalla lo muestra como "no se pudo iniciar").
 */
export function createPgBossProducer(options: JobProducerOptions): JobProducer {
  const { logger } = options;
  let started: Promise<PgBoss> | undefined;

  const connect = (): Promise<PgBoss> => {
    started ??= (async () => {
      const boss = new PgBoss({
        connectionString: options.connectionString,
        schema: options.schema ?? 'pgboss',
        application_name: options.applicationName ?? 'linkus-web-producer',
        max: 2,
        supervise: false,
        schedule: false,
        migrate: false,
        createSchema: false,
      });
      boss.on('error', (error: unknown) => logger.error({ err: error }, 'job producer error'));
      await boss.start();
      return boss;
    })();
    // Si el arranque falla, el siguiente envío vuelve a intentarlo.
    started.catch(() => {
      started = undefined;
    });
    return started;
  };

  return {
    enqueue: async (name, payload, enqueueOptions = {}) => {
      const boss = await connect();
      return boss.send(name, payload, {
        startAfter: enqueueOptions.startAfter,
        singletonKey: enqueueOptions.singletonKey,
        singletonSeconds: enqueueOptions.singletonSeconds,
      });
    },
    stop: async () => {
      const current = started;
      started = undefined;
      if (!current) return;
      try {
        await (await current).stop({ graceful: true, timeout: 5_000 });
      } catch {
        // Ya estaba cerrado o nunca abrió.
      }
    },
  };
}
