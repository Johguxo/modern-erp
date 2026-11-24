// E1-H4 · runPlatformPipeline: SuperAdmin → Zod → caso de uso → afterCommit (ADR-007).
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { SequentialIdGenerator } from '@tests/support/fakes/sequential-id-generator';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { PlatformCtx } from '@/shared/context';

import { runPlatformPipeline, type PlatformHandler, type PlatformPipelineDeps } from './pipeline';

const contract = {
  inputSchema: z.object({ name: z.string().min(1) }),
  outputSchema: z.object({ id: z.string(), emailSent: z.boolean() }),
};
type C = typeof contract;

const CTX: PlatformCtx = { userId: 'u-admin', requestId: 'req-1' };

function setup(resolved: PlatformCtx | 'anonymous' | 'forbidden' = CTX) {
  const deps: PlatformPipelineDeps = {
    resolvePlatformCtx: () => Promise.resolve(resolved),
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    logger: new CapturingLogger(),
  };
  return deps;
}

function run(deps: PlatformPipelineDeps, handler: PlatformHandler<C>, rawInput: unknown) {
  return runPlatformPipeline(deps, contract, handler, {
    name: 'platform.test',
    headers: new Headers(),
    requestId: 'req-1',
    rawInput,
  });
}

describe('runPlatformPipeline', () => {
  it('SuperAdmin: llama al caso de uso y combina el resultado de afterCommit', async () => {
    const handler = vi.fn<PlatformHandler<C>>(({ shared }) => {
      shared.afterCommit(() => Promise.resolve({ emailSent: true }));
      return Promise.resolve({ id: 'x', emailSent: false });
    });
    const result = await run(setup(), handler, { name: 'Acme' });
    expect(result).toEqual({ ok: true, data: { id: 'x', emailSent: true } });
    expect(handler.mock.calls[0]?.[0].ctx).toEqual(CTX);
  });

  it('sin sesión → UNAUTHENTICATED y no llama al caso de uso', async () => {
    const handler = vi.fn<PlatformHandler<C>>();
    const result = await run(setup('anonymous'), handler, { name: 'Acme' });
    expect(result.ok ? null : result.error.code).toBe('UNAUTHENTICATED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('no SuperAdmin → FORBIDDEN genérico y no llama al caso de uso', async () => {
    const handler = vi.fn<PlatformHandler<C>>();
    const result = await run(setup('forbidden'), handler, { name: 'Acme' });
    expect(result.ok ? null : result.error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('input inválido → VALIDATION con errores por campo', async () => {
    const handler = vi.fn<PlatformHandler<C>>();
    const result = await run(setup(), handler, { name: '' });
    expect(result.ok ? null : result.error.code).toBe('VALIDATION');
    expect(result.ok ? null : result.error.fieldErrors?.name).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });
});
