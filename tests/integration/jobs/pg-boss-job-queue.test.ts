// E0-H5 · Adaptador pg-boss de los puertos JobQueue/JobConsumer contra el Postgres de pruebas.
// Cada corrida usa su propio esquema (pgboss_test_<hex>) y lo borra al final.
import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getEnv } from '@/env';
import { createPgBossRuntime, type JobRuntime } from '@/shared/adapters/pg-boss-job-queue';
import type { Job } from '@/shared/ports/job-queue';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';

import { newId } from '../helpers/db';

const SCHEMA = `pgboss_test_${randomBytes(6).toString('hex')}`;
const JOB_TIMEOUT_MS = 15_000;

const logger = new CapturingLogger();
let runtime: JobRuntime;

/** Promesa que se resuelve con el primer job que recibe el handler, o falla tras `ms`. */
function deferredJob(ms: number) {
  let resolve!: (job: Job) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Job>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer = setTimeout(() => reject(new Error(`El handler no recibió el job en ${ms} ms`)), ms);
  return {
    promise: promise.finally(() => clearTimeout(timer)),
    resolve,
  };
}

/** Estado del job directamente en la tabla de pg-boss (el puerto no expone lecturas). */
async function jobState(id: string): Promise<string | undefined> {
  const rows = await getDbAdmin().execute<{ state: string }>(
    sql`select state::text as state from ${sql.identifier(SCHEMA)}.job where id = ${id}`,
  );
  return rows[0]?.state;
}

async function waitFor<T>(fn: () => Promise<T>, done: (value: T) => boolean, ms: number) {
  const deadline = Date.now() + ms;
  let value = await fn();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    value = await fn();
  }
  return value;
}

beforeAll(async () => {
  runtime = createPgBossRuntime({
    connectionString: getEnv().DATABASE_URL_ADMIN,
    schema: SCHEMA,
    pollingIntervalSeconds: 0.5,
    logger,
    applicationName: 'linkus-worker-test',
  });
  await runtime.start();
}, 60_000);

afterAll(async () => {
  await runtime?.stop();
  await getDbAdmin().execute(sql`drop schema if exists ${sql.identifier(SCHEMA)} cascade`);
  await closeDatabases();
}, 60_000);

describe('adaptador pg-boss (JobQueue y JobConsumer)', () => {
  it('ensureQueues crea las colas y es idempotente', async () => {
    await runtime.ensureQueues(['notifications.send-email']);
    await runtime.ensureQueues(['notifications.send-email']);

    const rows = await getDbAdmin().execute<{ name: string }>(
      sql`select name from ${sql.identifier(SCHEMA)}.queue where name = 'notifications.send-email'`,
    );
    expect(rows).toHaveLength(1);
  });

  it(
    'encolar y procesar devuelve el mismo id y el payload intacto (incluido tenantId)',
    async () => {
      await runtime.ensureQueues(['notifications.send-email']);
      const received = deferredJob(JOB_TIMEOUT_MS);
      await runtime.work('notifications.send-email', (job) => {
        received.resolve(job);
        return Promise.resolve();
      });

      const payload = {
        tenantId: newId(),
        requestId: newId(),
        extra: { to: 'aprobador@genrent.pe', amount: '1250.50', lines: [1, 2] },
      };
      const id = await runtime.queue.enqueue('notifications.send-email', payload);

      expect(id).toEqual(expect.any(String));
      const job = await received.promise;
      expect(job.id).toBe(id);
      expect(job.payload).toEqual(payload);
      expect(job.payload.tenantId).toBe(payload.tenantId);
      expect(
        await waitFor(
          () => jobState(job.id),
          (s) => s === 'completed',
          5_000,
        ),
      ).toBe('completed');
    },
    JOB_TIMEOUT_MS + 10_000,
  );

  // HALLAZGO (pg-boss 12): con la política por defecto de la cola ('standard') singletonKey sola
  // no deduplica: pg-boss solo aplica índices únicos por clave en las políticas short/singleton/
  // stately/exclusive, o con singletonSeconds (índice job_i4 sobre singleton_on). El adaptador hoy
  // no pasa ni lo uno ni lo otro, así que el segundo enqueue devuelve otro id. Se marca como
  // `fails` para documentar la brecha con el contrato del puerto; cuando el adaptador se corrija
  // esta prueba empezará a "fallar" y habrá que quitar `.fails`.
  it.fails('un singletonKey repetido devuelve null (sin consumidor en la cola)', async () => {
    await runtime.ensureQueues(['approvals.reminders']);
    const key = `reminder-${newId()}`;
    const payload = { tenantId: newId(), requestId: newId() };

    const first = await runtime.queue.enqueue('approvals.reminders', payload, {
      singletonKey: key,
    });
    const second = await runtime.queue.enqueue('approvals.reminders', payload, {
      singletonKey: key,
    });

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
  });

  it(
    'un handler que lanza deja el job fallido (o en reintento), nunca completado',
    async () => {
      await runtime.ensureQueues(['documents.render-pdf']);
      await runtime.work('documents.render-pdf', () => {
        return Promise.reject(new Error('render roto'));
      });

      const id = await runtime.queue.enqueue('documents.render-pdf', { tenantId: newId() });
      expect(id).toEqual(expect.any(String));

      const state = await waitFor(
        () => jobState(id as string),
        (s) => s === 'retry' || s === 'failed',
        JOB_TIMEOUT_MS,
      );
      expect(['retry', 'failed']).toContain(state);
    },
    JOB_TIMEOUT_MS + 10_000,
  );
});
