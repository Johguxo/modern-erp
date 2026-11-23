// E0-H5 · Ciclo de vida del worker: crea las 4 colas, stop() idempotente y sin conexiones abiertas,
// y apagado limpio del proceso con SIGTERM.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getEnv } from '@/env';
import { QUEUES } from '@/shared/ports/job-queue';
import { startWorker } from '@/worker-runtime';
import { TEST_ENV } from '@tests/setup/test-env.mts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SCHEMA = `pgboss_test_${randomBytes(6).toString('hex')}`;

// Cliente propio: stop() llama a closeDatabases(), que cierra las conexiones de la app.
let observer: postgres.Sql;

beforeAll(() => {
  observer = postgres(getEnv().DATABASE_URL_ADMIN, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
    connection: { application_name: 'linkus-test-observer' },
  });
});

afterAll(async () => {
  await observer.unsafe(`drop schema if exists "${SCHEMA}" cascade`);
  await observer.end({ timeout: 5 });
});

async function workerConnections(): Promise<number> {
  const [row] = await observer<{ count: number }[]>`
    select count(*)::int as count from pg_stat_activity
    where application_name = 'linkus-worker' and datname = current_database()`;
  return row?.count ?? 0;
}

async function waitForZero(fn: () => Promise<number>, ms: number): Promise<number> {
  const deadline = Date.now() + ms;
  let value = await fn();
  while (value !== 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    value = await fn();
  }
  return value;
}

describe('ciclo de vida del worker', () => {
  it('startWorker() crea las 4 colas; stop() es idempotente y no deja conexiones abiertas', async () => {
    const worker = await startWorker({ schema: SCHEMA });
    let stopped = false;
    try {
      // Sin las colas internas de pg-boss (prefijo __pgboss__).
      const rows = await observer<{ name: string }[]>`
        select name from ${observer(SCHEMA)}.queue where left(name, 10) <> '__pgboss__'`;
      expect(rows.map((r) => r.name).sort()).toEqual([...QUEUES].sort());
      expect(await workerConnections()).toBeGreaterThan(0);

      await expect(worker.stop()).resolves.toBeUndefined();
      stopped = true;
      // Segunda llamada: no hace nada (misma promesa ya resuelta, sin lanzar).
      await expect(worker.stop()).resolves.toBeUndefined();

      expect(await waitForZero(workerConnections, 5_000)).toBe(0);
    } finally {
      if (!stopped) await worker.stop();
    }
  }, 60_000);
});

/** Solo lo mínimo para que Node arranque; nada del entorno real del desarrollador. */
function baseEnv(): Record<string, string> {
  const keys = ['PATH', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'HOME'];
  const env: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

describe('proceso del worker (src/worker.ts)', () => {
  // En Windows SIGTERM mata el proceso sin entregar la señal: se prueba a mano con Ctrl+C.
  it.skipIf(process.platform === 'win32')(
    'con SIGTERM se apaga limpio: registra "worker stopped" y sale con 0',
    async () => {
      const env = getEnv();
      // Sin shell y con argumentos en arreglo: la ruta del repo tiene espacios.
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
        cwd: ROOT,
        env: {
          ...baseEnv(),
          ...TEST_ENV,
          DATABASE_URL: env.DATABASE_URL,
          DATABASE_URL_ADMIN: env.DATABASE_URL_ADMIN,
          LOG_LEVEL: 'info',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

      const exited = new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code));
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`El worker no arrancó en 30 s. stderr: ${stderr}`)),
            30_000,
          );
          child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
            if (stdout.includes('worker started')) {
              clearTimeout(timer);
              resolve();
            }
          });
          void exited.then((code) => {
            clearTimeout(timer);
            reject(new Error(`El worker terminó antes de arrancar (código ${code}): ${stderr}`));
          });
        });

        child.kill('SIGTERM');
        const code = await exited;

        expect(code).toBe(0);
        expect(stdout).toContain('worker stopped');
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    },
    60_000,
  );
});
