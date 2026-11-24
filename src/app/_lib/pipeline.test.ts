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
import { ConflictError, NotFoundError, UnauthenticatedError } from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import { messages } from '@/ui/messages/es-PE';

import {
  runPipeline,
  runPublicPipeline,
  type Handler,
  type PipelineDeps,
  type PublicHandler,
} from './pipeline';

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

  it('la salida se valida dentro de la transacción (un fallo revierte)', async () => {
    const { deps } = setup();
    let insideTransaction = false;
    let parsedInside = false;
    const runInTenant: PipelineDeps['runInTenant'] = async (_ctx, fn) => {
      insideTransaction = true;
      try {
        return await fn({} as DbTransaction);
      } catch (error) {
        parsedInside = insideTransaction;
        throw error;
      } finally {
        insideTransaction = false;
      }
    };
    const handler = (() => Promise.resolve({ id: 42 })) as unknown as Handler<C>;

    const result = await run({ ...deps, runInTenant }, handler);

    expect(!result.ok && result.error.code).toBe('INTERNAL');
    expect(parsedInside).toBe(true);
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

// E1-H2 · Modo solo lectura: action() rechaza las escrituras con FORBIDDEN (tenant_read_only).
describe('runPipeline en modo solo lectura', () => {
  function runWithAccess(deps: PipelineDeps, handler: Handler<C>, access?: 'read' | 'write') {
    return runPipeline(deps, contract, 'requests.create', handler, {
      name: 'createThing',
      headers: new Headers(),
      requestId: REQUEST_ID,
      rawInput: validInput,
      access,
    });
  }

  it.each([['write' as const], [undefined]])(
    'action() rechaza las escrituras con FORBIDDEN (reason: tenant_read_only) con access %s',
    async (access) => {
      const { deps, tenantCalls } = setup({ ctx: makeCtx({ readOnly: true }) });
      const handler = vi.fn<Handler<C>>();

      const result = await runWithAccess(deps, handler, access);

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: messages.errors.reasons.tenant_read_only(),
          fieldErrors: undefined,
          requestId: REQUEST_ID,
        },
      });
      expect(handler).not.toHaveBeenCalled();
      expect(tenantCalls).toEqual([]);
    },
  );

  it('en solo lectura, access read pasa', async () => {
    const { deps } = setup({ ctx: makeCtx({ readOnly: true }) });

    const result = await runWithAccess(
      deps,
      () => Promise.resolve({ id: '1', title: 't' }),
      'read',
    );

    expect(result).toEqual({ ok: true, data: { id: '1', title: 't' } });
  });

  it('sin solo lectura, una escritura pasa', async () => {
    const { deps } = setup({ ctx: makeCtx({ readOnly: false }) });

    const result = await runWithAccess(deps, () => Promise.resolve({ id: '1', title: 't' }));

    expect(result.ok).toBe(true);
  });
});

// E1-H2 · publicAction(): sin ctx ni transacción, con la misma validación, errores y logs.
describe('runPublicPipeline', () => {
  function runPublic(
    handler: PublicHandler<C>,
    rawInput: unknown = validInput,
    logger = new CapturingLogger(),
  ) {
    return runPublicPipeline({ logger }, contract, handler, {
      name: 'auth.signIn',
      headers: new Headers(),
      requestId: REQUEST_ID,
      rawInput,
    });
  }

  it('no requiere ctx: llama al handler con el input validado, requestId y logger', async () => {
    const handler = vi.fn<PublicHandler<C>>(({ input }) =>
      Promise.resolve({ id: 'id-1', title: input.title, extra: 'x' } as never),
    );

    const result = await runPublic(handler, { ...validInput, sobra: 1 });

    expect(result).toEqual({ ok: true, data: { id: 'id-1', title: 'Pedido' } });
    const args = handler.mock.calls[0]?.[0];
    expect(args?.input).toEqual(validInput);
    expect(args?.requestId).toBe(REQUEST_ID);
  });

  it('input inválido → VALIDATION con mensajes es-PE y el handler no se llama', async () => {
    const handler = vi.fn<PublicHandler<C>>();

    const result = await runPublic(handler, { title: '', lines: [] });

    expect(!result.ok && result.error.code).toBe('VALIDATION');
    expect(!result.ok && result.error.fieldErrors).toEqual({
      title: [messages.validation.required],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('traduce errores de dominio con reason a mensajes es-PE (sin revelar si el correo existe)', async () => {
    const result = await runPublic(() =>
      Promise.reject(new UnauthenticatedError({ reason: 'invalid_credentials' })),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Correo o contraseña incorrectos.',
        fieldErrors: undefined,
        requestId: REQUEST_ID,
      },
    });
  });

  it('un error inesperado → INTERNAL genérico, sin detalles técnicos', async () => {
    const result = await runPublic(() => Promise.reject(new Error('gotrue 500 secret')));

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: messages.errors.codes.INTERNAL, requestId: REQUEST_ID },
    });
  });

  it("registra 'action finished' con requestId, nombre y outcome", async () => {
    const logger = new CapturingLogger();
    await runPublic(
      () => Promise.reject(new UnauthenticatedError({ reason: 'invalid_credentials' })),
      validInput,
      logger,
    );

    const entry = logger.find('action finished');
    expect(entry?.level).toBe('info');
    expect(entry?.fields).toMatchObject({ outcome: 'UNAUTHENTICATED' });
    expect(entry?.bindings).toMatchObject({ requestId: REQUEST_ID, action: 'auth.signIn' });
  });
});

describe('runPipeline con afterCommit (E1-H3)', () => {
  it('la tarea corre después del commit y su resultado se suma a la salida', async () => {
    const { deps } = setup();
    const order: string[] = [];
    const runInTenant: PipelineDeps['runInTenant'] = async (ctx, fn) => {
      const value = await fn({} as DbTransaction);
      order.push('commit');
      return value;
    };
    const handler: Handler<C> = ({ shared }) => {
      shared.afterCommit(() => {
        order.push('task');
        return Promise.resolve({ title: 'Enviado' });
      });
      return Promise.resolve({ id: 'id-1', title: 'Pedido' });
    };

    const result = await run({ ...deps, runInTenant }, handler);

    expect(order).toEqual(['commit', 'task']);
    expect(result).toEqual({ ok: true, data: { id: 'id-1', title: 'Enviado' } });
  });

  it('si la tarea falla, la acción sigue ok con la salida original y queda un error en el log', async () => {
    const { deps, logger } = setup();
    const handler: Handler<C> = ({ shared }) => {
      shared.afterCommit(() => Promise.reject(new Error('smtp down')));
      return Promise.resolve({ id: 'id-1', title: 'Pedido' });
    };

    const result = await run(deps, handler);

    expect(result).toEqual({ ok: true, data: { id: 'id-1', title: 'Pedido' } });
    expect(logger.find('after-commit task failed')?.level).toBe('error');
  });

  it('si la transacción falla, la tarea no corre', async () => {
    const { deps } = setup();
    const task = vi.fn(() => Promise.resolve());
    const handler: Handler<C> = ({ shared }) => {
      shared.afterCommit(task);
      return Promise.reject(new ConflictError());
    };

    const result = await run(deps, handler);

    expect(result.ok).toBe(false);
    expect(task).not.toHaveBeenCalled();
  });
});
