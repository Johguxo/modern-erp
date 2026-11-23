// E0-H1 · El worker falla al arrancar si falta una variable obligatoria (llama a getEnv() al iniciar).
import { spawn } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEST_ENV } from '../setup/test-env.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Solo lo mínimo para que Node arranque (en Windows, SystemRoot y compañía); nada del entorno real. */
function baseEnv(): Record<string, string> {
  const keys = ['PATH', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'HOME'];
  const env: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function runWorker(extraEnv: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    // Sin shell y con argumentos en arreglo: la ruta del repo tiene espacios.
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
      cwd: ROOT,
      // Cast: Next declara NODE_ENV obligatorio en ProcessEnv; aquí se omite a propósito.
      env: { ...baseEnv(), ...extraEnv } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('falla al arrancar si falta alguna variable (worker)', () => {
  it('sin variables de entorno el worker termina con error y nombra SESSION_SECRET', async () => {
    const { code, stderr } = await runWorker({});

    expect(code).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET');
  });

  it('con un entorno válido el worker arranca y termina con código 0', async () => {
    const { code, stdout } = await runWorker({ ...TEST_ENV, LOG_LEVEL: 'info' });

    // El logger escribe JSON a stdout.
    expect(stdout).toContain('"msg":"worker env ok');
    expect(code).toBe(0);
  });
});
