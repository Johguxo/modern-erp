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

export interface EnqueueOptions {
  readonly startAfter?: Date;
  /**
   * Evita duplicados: si en los últimos `singletonSeconds` ya se encoló un job con esta clave
   * en la misma cola, no se encola otro y enqueue devuelve null.
   */
  readonly singletonKey?: string;
  /** Ventana de la deduplicación por singletonKey. Por defecto, 3600 s (1 hora). */
  readonly singletonSeconds?: number;
}

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
