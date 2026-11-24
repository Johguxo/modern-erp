// E0-H3 · route() para api/v1: { data } o { error }, x-request-id, no-store y control de Origin.
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { fakeCtxResolver } from '@tests/support/fakes/fake-ctx-resolver';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import {
  SequentialIdGenerator,
  sequentialUuid,
} from '@tests/support/fakes/sequential-id-generator';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { DbTransaction } from '@/db';
import type { Ctx } from '@/shared/context';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '@/shared/errors';
import { messages } from '@/ui/messages/es-PE';

import type { Handler, PipelineDeps } from './pipeline';
import { createRoute } from './route';

const APP_URL = 'http://localhost:3000';
const ENDPOINT = `${APP_URL}/api/v1/things`;

const contract = {
  inputSchema: z.object({ name: z.string().min(1) }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
};
type C = typeof contract;

const echo: Handler<C> = ({ input }) => Promise.resolve({ id: 'thing-1', name: input.name });

function makeRoute(options: { ctx?: Ctx | null; successStatus?: 200 | 201 } = {}) {
  const ctx =
    options.ctx === undefined ? makeCtx({ permissions: ['catalog.manage'] }) : options.ctx;
  const deps: PipelineDeps = {
    resolveCtx: fakeCtxResolver(ctx).resolve,
    runInTenant: (_ctx, fn) => fn({} as DbTransaction),
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    logger: new CapturingLogger(),
  };
  const route = createRoute(
    () => deps,
    () => APP_URL,
  );
  return (handler: Handler<C> = echo) =>
    route(contract, 'catalog.manage', handler, { successStatus: options.successStatus });
}

function post(body: string | undefined, headers: Record<string, string> = { origin: APP_URL }) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('createRoute', () => {
  it('GET lee la entrada de la query y responde 200 con { data }', async () => {
    const handler = vi.fn(echo);
    const response = await makeRoute()(handler)(new Request(`${ENDPOINT}?name=Tornillo`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: 'thing-1', name: 'Tornillo' } });
    expect(handler.mock.calls[0]?.[0].input).toEqual({ name: 'Tornillo' });
  });

  it('GET no exige Origin', async () => {
    const response = await makeRoute()()(new Request(`${ENDPOINT}?name=x`));

    expect(response.status).toBe(200);
  });

  it('POST con JSON y Origin correcto → 200 con { data }, x-request-id y Cache-Control no-store', async () => {
    const response = await makeRoute()()(post(JSON.stringify({ name: 'Perno' })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: 'thing-1', name: 'Perno' } });
    expect(response.headers.get('x-request-id')).toBe(sequentialUuid(1));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('POST con successStatus 201 → 201', async () => {
    const response = await makeRoute({ successStatus: 201 })()(
      post(JSON.stringify({ name: 'Perno' })),
    );

    expect(response.status).toBe(201);
  });

  it('respeta un x-request-id válido en la respuesta', async () => {
    const response = await makeRoute()()(
      post(JSON.stringify({ name: 'Perno' }), { origin: APP_URL, 'x-request-id': 'abc-12345678' }),
    );

    expect(response.headers.get('x-request-id')).toBe('abc-12345678');
  });

  it.each([
    ['sin Origin', {}],
    ['con otro Origin', { origin: 'https://evil.example' }],
    ['con otro puerto', { origin: 'http://localhost:4000' }],
  ])('POST %s → 403 FORBIDDEN sin llamar al handler', async (_label, headers) => {
    const handler = vi.fn(echo);

    const response = await makeRoute()(handler)(post(JSON.stringify({ name: 'x' }), headers));

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: messages.errors.codes.FORBIDDEN,
        requestId: sequentialUuid(1),
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['PATCH', 'DELETE'])('%s también exige el mismo Origin', async (method) => {
    const response = await makeRoute()()(
      new Request(ENDPOINT, { method, body: JSON.stringify({ name: 'x' }) }),
    );

    expect(response.status).toBe(403);
  });

  it('JSON malformado → 400 BAD_REQUEST', async () => {
    const handler = vi.fn(echo);

    const response = await makeRoute()(handler)(post('{"name": '));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: messages.errors.codes.BAD_REQUEST,
        requestId: sequentialUuid(1),
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('cuerpo vacío se valida como {} → 422', async () => {
    const response = await makeRoute()()(post(undefined));

    expect(response.status).toBe(422);
  });

  it('entrada inválida → 422 con fieldErrors', async () => {
    const response = await makeRoute()()(post(JSON.stringify({ name: '' })));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { name: [messages.validation.required] } },
    });
  });

  it('sin sesión → 401', async () => {
    const response = await makeRoute({ ctx: null })()(post(JSON.stringify({ name: 'x' })));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('sin permiso → 403', async () => {
    const response = await makeRoute({ ctx: makeCtx({ permissions: [] }) })()(
      post(JSON.stringify({ name: 'x' })),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it.each([
    [401, 'UNAUTHENTICATED', () => new UnauthenticatedError()],
    [403, 'FORBIDDEN', () => new ForbiddenError()],
    [404, 'NOT_FOUND', () => new NotFoundError()],
    [409, 'CONFLICT', () => new ConflictError()],
    [500, 'INTERNAL', () => new Error('db password=hunter2')],
  ] as const)('handler que lanza → %i %s con cuerpo { error }', async (status, code, make) => {
    const response = await makeRoute()(() => Promise.reject(make()))(
      post(JSON.stringify({ name: 'x' })),
    );
    const text = await response.text();

    expect(response.status).toBe(status);
    expect(JSON.parse(text)).toEqual({
      error: expect.objectContaining({
        code,
        message: messages.errors.codes[code],
        requestId: sequentialUuid(1),
      }) as unknown,
    });
    expect(text).not.toContain('hunter2');
    expect(response.headers.get('x-request-id')).toBe(sequentialUuid(1));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

// E1-H2 · route() trata GET y HEAD como lectura: en solo lectura pasan; el resto → 403.
describe('createRoute en modo solo lectura', () => {
  const readOnlyCtx = () => makeCtx({ permissions: ['catalog.manage'], readOnly: true });

  it('GET pasa con el tenant en solo lectura', async () => {
    const response = await makeRoute({ ctx: readOnlyCtx() })()(new Request(`${ENDPOINT}?name=x`));

    expect(response.status).toBe(200);
  });

  it('POST → 403 FORBIDDEN con el mensaje de solo lectura y sin llamar al handler', async () => {
    const handler = vi.fn(echo);

    const response = await makeRoute({ ctx: readOnlyCtx() })(handler)(
      post(JSON.stringify({ name: 'x' })),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: messages.errors.reasons.tenant_read_only() },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
