// Puerto de colas. Adaptador: src/shared/adapters/pg-boss-job-queue.ts (pg-boss).
export const QUEUES = [
  'notifications.send-email',
  'approvals.reminders',
  'documents.render-pdf',
  'catalog.import',
] as const;
export type QueueName = (typeof QUEUES)[number];

/** Debe ser serializable a JSON. Los jobs llevan su tenant: el consumidor arma el contexto con él. */
export interface JobPayload {
  readonly tenantId: string | null;
  readonly requestId?: string;
  readonly [key: string]: unknown;
}

/**
 * Deduplicación: dentro de la misma franja fija de `singletonSeconds` (alineada al reloj, no una
 * ventana móvil), solo se encola un job por clave y cola; los siguientes devuelven null. La clave
 * queda ocupada aunque el job ya haya terminado. Para "uno por día", incluye la fecha en la clave.
 */
export interface SingletonOptions {
  readonly singletonKey: string;
  readonly singletonSeconds: number;
}

export type EnqueueOptions = { readonly startAfter?: Date } & (
  SingletonOptions | { readonly singletonKey?: undefined; readonly singletonSeconds?: undefined }
);

/** Lado productor (casos de uso). */
export interface JobQueue {
  /** Devuelve el id del job, o null si se descartó por duplicado (singletonKey). */
  enqueue(queue: QueueName, payload: JobPayload, options?: EnqueueOptions): Promise<string | null>;
}

export interface Job {
  readonly id: string;
  readonly payload: JobPayload;
}

/** Procesa un job. Si lanza, el job queda como fallido (y se reintenta según la cola). */
export type JobHandler = (job: Job) => Promise<void>;

/** Lado consumidor (worker). */
export interface JobConsumer {
  work(queue: QueueName, handler: JobHandler): Promise<void>;
}
