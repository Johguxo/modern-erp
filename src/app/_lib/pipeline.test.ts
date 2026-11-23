// E0-H3 · Núcleo de action()/route(): ctx → permiso → Zod → transacción → salida → ActionResult.
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { fakeCtxResolver } from '@tests/support/fakes/fake-ctx-resolver';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { SequentialIdGenerator } from '@tests/support/fakes/sequential-id-generator';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { DbTransaction } from '@/db';
import type { Ctx } from '@/shared/context';
import { ConflictError, NotFoundError } from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import { messages } from '@/ui/messages/es-PE';

import { runPipeline, type Handler, type PipelineDeps } from './pipeline';

const REQUEST_ID = 'req-pipeline-0001';
const PERSONAL_DATA = 'dni-77665544';

const contract = {
  inputSchema: z.object({
    title: z.string().min(1),
    contactEmail: z.email().optional(),
    lines: z.array(z.object({ quantity: z.number().min(1) })),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string() }),
};
type C = typeof contract;

const validInput = { title: 'Pedido', lines: [{ quantity: 2 }] };

function setup(options: { ctx?: Ctx | null } = {}) {
  const ctx = options.ctx === undefined ? makeCtx() : options.ctx;
  const resolver = fakeCtxResolver(ctx);
  const logger = new CapturingLogger();
  const fakeTx = { fake: 'tx' } as unknown as DbTransaction;
  const tenantCalls: Ctx[] = [];
  const runInTenant: PipelineDeps['runInTenant'] = (ctx, fn) => {
    tenantCalls.push(ctx);
    return fn(fakeTx);
  };
  const deps: PipelineDeps = {
    resolveCtx: resolver.resolve,
    runInTenant,
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    logger,
  };
  return { deps, resolver, logger, fakeTx, tenantCalls };
}

function run(
  deps: PipelineDeps,
  handler: Handler<C>,
  rawInput: unknown = validInput,
  permission: Permission | null = 'requests.create',
) {
  return runPipeline(deps, contract, permission, handler, {
    name: 'createThing',
    headers: new Headers({ cookie: 'sb=session' }),
    requestId: REQUEST_ID,
    rawInput,
  });
}

/** Todo lo registrado, incluido el message de los errores (que JSON.stringify omite). */
function loggedText(logger: CapturingLogger): string {
  return JSON.stringify(logger.entries, (_key, value: unknown) =>
    value instanceof Error ? { ...value, message: value.message, stack: value.stack } : value,
  );
}

describe('runPipeline', () => {
  it('caso feliz: llama al handler con ctx, input, tx y shared, y devuelve ok', async () => {
    const { deps, fakeTx, tenantCalls } = setup();
    const handler = vi.fn<Handler<C>>(({ input }) =>
      Promise.resolve({ id: 'id-1', title: input.title }),
    );

    const result = await run(deps, handler);

    expect(result).toEqual({ ok: true, data: { id: 'id-1', title: 'Pedido' } });
    expect(tenantCalls).toHaveLength(1);
    const args = handler.mock.calls[0]?.[0];
    expect(args?.tx).toBe(fakeTx);
    expect(args?.input).toEqual(validInput);
    expect(args?.ctx.tenantId).toBe(makeCtx().tenantId);
    expect(args?.ctx.requestId).toBe(REQUEST_ID);
    expect(args?.shared.clock).toBe(deps.clock);
    expect(args?.shared.ids).toBe(deps.ids);
  });

  it('pasa al resolver las cabeceras y el requestId', async () => {
    const { deps, resolver } = setup();

    await run(deps, () => Promise.resolve({ id: '1', title: 't' }));

    expect(resolver.calls).toHaveLength(1);
    expect(resolver.calls[0]?.requestId).toBe(REQUEST_ID);
    expect(resolver.calls[0]?.headers.get('cookie')).toBe('sb=session');
  });

  it('runInTenant recibe el ctx resuelto', async () => {
    const { deps, tenantCalls } = setup({ ctx: makeCtx({ tenantId: 'aaaa' }) });

    await run(deps, () => Promise.resolve({ id: '1', title: 't' }));

    expect(tenantCalls[0]?.tenantId).toBe('aaaa');
  });

  it('outputSchema descarta campos de más en la salida', async () => {
    const { deps } = setup();
    const handler = (() =>
      Promise.resolve({ id: 'id-1', title: 't', passwordHash: 'x' })) as Handler<C>;

    const result = await run(deps, handler);

    expect(result).toEqual({ ok: true, data: { id: 'id-1', title: 't' } });
  });

  it('el input se transforma con el esquema antes de llegar al handler', async () => {
    const { deps } = setup();
    const handler = vi.fn<Handler<C>>(() => Promise.resolve({ id: '1', title: 't' }));

    await run(deps, handler, { ...validInput, extra: 'se descarta' });

    expect(handler.mock.calls[0]?.[0].input).toEqual(validInput);
  });

  it('sin sesión → UNAUTHENTICATED y el handler no se llama', async () => {
    const { deps, tenantCalls } = setup({ ctx: null });
    const handler = vi.fn<Handler<C>>();

    const result = await run(deps, handler);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: messages.errors.codes.UNAUTHENTICATED,
        fieldErrors: undefined,
        requestId: REQUEST_ID,
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(tenantCalls).toEqual([]);
  });

  it('sin permiso → FORBIDDEN y runInTenant no se llama', async () => {
    const { deps, tenantCalls } = setup({ ctx: makeCtx({ permissions: ['requests.read_own'] }) });
    const handler = vi.fn<Handler<C>>();

    const result = await run(deps, handler, validInput, 'requests.create');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('FORBIDDEN');
    expect(!result.ok && result.error.message).toBe(messages.errors.codes.FORBIDDEN);
    expect(tenantCalls).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('el permiso se revisa antes que la validación (sin permiso e input inválido → FORBIDDEN)', async () => {
    const { deps } = setup({ ctx: makeCtx({ permissions: [] }) });

    const result = await run(deps, vi.fn<Handler<C>>(), { title: '' });

    expect(!result.ok && result.error.code).toBe('FORBIDDEN');
  });

  it('permiso null con sesión pasa (sin permisos en el ctx)', async () => {
    const { deps } = setup({ ctx: makeCtx({ permissions: [] }) });

    const result = await run(
      deps,
      () => Promise.resolve({ id: '1', title: 't' }),
      validInput,
      null,
    );

    expect(result.ok).toBe(true);
  });

  it('permiso null sin sesión → UNAUTHENTICATED', async () => {
    const { deps } = setup({ ctx: null });

    const result = await run(deps, vi.fn<Handler<C>>(), validInput, null);

    expect(!result.ok && result.error.code).toBe('UNAUTHENTICATED');
  });

  it('input inválido → VALIDATION con fieldErrors en rutas con punto y mensajes es-PE; no se registra el input', async () => {
    const { deps, tenantCalls, logger } = setup();
    const handler = vi.fn<Handler<C>>();

    const result = await run(deps, handler, {
      title: '',
      contactEmail: PERSONAL_DATA,
      lines: [{ quantity: 1 }, { quantity: 0 }],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: messages.errors.codes.VALIDATION,
        fieldErrors: {
          title: [messages.validation.required],
          contactEmail: [messages.validation.invalidFormat],
          'lines.1.quantity': [messages.validation.tooSmall(1)],
        },
        requestId: REQUEST_ID,
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(tenantCalls).toEqual([]);
    expect(loggedText(logger)).not.toContain(PERSONAL_DATA);
  });

  it('input no objeto (null) → VALIDATION en root', async () => {
    const { deps } = setup();

    const result = await run(deps, vi.fn<Handler<C>>(), null);

    expect(!result.ok && result.error.fieldErrors).toEqual({
      root: [messages.validation.required],
    });
  });

  it.each([
    ['NOT_FOUND', () => new NotFoundError({ message: 'request r-1 not visible' })],
    ['CONFLICT', () => new ConflictError({ message: 'stale version 3' })],
  ] as const)('%s lanzado por el handler → código correcto y mensaje es-PE', async (code, make) => {
    const { deps } = setup();

    const result = await run(deps, () => Promise.reject(make()));

    expect(result).toEqual({
      ok: false,
      error: {
        code,
        message: messages.errors.codes[code],
        fieldErrors: undefined,
        requestId: REQUEST_ID,
      },
    });
  });

  it("Error('boom') → INTERNAL con mensaje genérico y log de error con requestId", async () => {
    const { deps, logger } = setup();
    const boom = new Error('boom');

    const result = await run(deps, () => Promise.reject(boom));

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: messages.errors.codes.INTERNAL, requestId: REQUEST_ID },
    });
    expect(JSON.stringify(result)).not.toContain('boom');
    const entry = logger.entries.find((e) => e.level === 'error');
    expect(entry?.fields.err).toBe(boom);
    expect(entry?.bindings).toMatchObject({ requestId: REQUEST_ID, action: 'createThing' });
    expect(entry?.bindings).toMatchObject({ tenantId: makeCtx().tenantId });
  });

  it('una salida que no cumple outputSchema → INTERNAL', async () => {
    const { deps, logger } = setup();
    const handler = (() => Promise.resolve({ id: 42 })) as unknown as Handler<C>;

    const result = await run(deps, handler);

    expect(!result.ok && result.error.code).toBe('INTERNAL');
    expect(logger.entries.some((e) => e.level === 'error')).toBe(true);
  });

  it("registra 'action finished' con outcome OK y con el código de error", async () => {
    const ok = setup();
    await run(ok.deps, () => Promise.resolve({ id: '1', title: 't' }));
    const failed = setup();
    await run(failed.deps, () => Promise.reject(new ConflictError()));

    const okEntry = ok.logger.find('action finished');
    expect(okEntry?.level).toBe('info');
    expect(okEntry?.fields).toMatchObject({ outcome: 'OK' });
    expect(okEntry?.fields.durationMs).toBeTypeOf('number');
    expect(okEntry?.bindings).toMatchObject({ requestId: REQUEST_ID, action: 'createThing' });
    expect(failed.logger.find('action finished')?.fields).toMatchObject({ outcome: 'CONFLICT' });
  });

  it("sin sesión también registra 'action finished' con outcome UNAUTHENTICATED", async () => {
    const { deps, logger } = setup({ ctx: null });

    await run(deps, vi.fn<Handler<C>>());

    expect(logger.find('action finished')?.fields).toMatchObject({ outcome: 'UNAUTHENTICATED' });
  });
});
