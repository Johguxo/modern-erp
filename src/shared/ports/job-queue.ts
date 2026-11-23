// Puerto de colas (lado productor). Adaptador pg-boss y consumidores en E0-H5.
export const QUEUES = [
  'notifications.send-email',
  'approvals.reminders',
  'documents.render-pdf',
  'catalog.import',
] as const;
export type QueueName = (typeof QUEUES)[number];

/** Debe ser serializable a JSON. */
export interface JobPayload {
  readonly tenantId: string | null;
  readonly requestId?: string;
  readonly [key: string]: unknown;
}

export interface JobQueue {
  enqueue(
    queue: QueueName,
    payload: JobPayload,
    options?: { startAfter?: Date; singletonKey?: string },
  ): Promise<string>;
}
