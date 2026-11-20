// E0-H1 · El servidor web falla al arrancar si falta una variable obligatoria.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('register() valida el entorno al arrancar el servidor web', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sale con código 1 si falta SESSION_SECRET (runtime nodejs)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('SESSION_SECRET', '');
    const { register } = await import('./instrumentation');

    await register();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('no sale con un entorno válido', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('./instrumentation');

    await register();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('no valida durante `next build` (NEXT_PHASE=phase-production-build)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('SESSION_SECRET', '');
    const { register } = await import('./instrumentation');

    await register();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('no hace nada en el runtime edge', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('SESSION_SECRET', '');
    const { register } = await import('./instrumentation');

    await register();

    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('src/env.ts no valida al importarse', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('importar el módulo sin variables no lanza; getEnv() sí', async () => {
    vi.resetModules();
    vi.stubEnv('SESSION_SECRET', '');
    const mod = await import('./env');

    expect(() => mod.getEnv()).toThrow(/SESSION_SECRET/);
  });
});
