// E0-H3 · action(contract, permission, handler): requestId desde x-request-id y pipeline común.
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { fakeCtxResolver } from '@tests/support/fakes/fake-ctx-resolver';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import {
  SequentialIdGenerator,
  sequentialUuid,
} from '@tests/support/fakes/sequential-id-generator';
import { headers } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { DbTransaction } from '@/db';
import type { Ctx } from '@/shared/context';

import { createAction } from './action';
import type { PipelineDeps } from './pipeline';

vi.mock('next/headers', () => ({ headers: vi.fn() }));

const contract = {
  inputSchema: z.object({ title: z.string().min(1) }),
  outputSchema: z.object({ requestId: z.string(), title: z.string() }),
};

function setHeaders(init: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue(new Headers(init));
}

function deps(ctx: Ctx | null = makeCtx()): PipelineDeps & { logger: CapturingLogger } {
  return {
    resolveCtx: fakeCtxResolver(ctx).resolve,
    runInTenant: (_ctx, fn) => fn({} as DbTransaction),
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    logger: new CapturingLogger(),
  };
}

beforeEach(() => {
  vi.mocked(headers).mockReset();
});

describe('createAction', () => {
  it('respeta un x-request-id válido y lo propaga al ctx y al log', async () => {
    setHeaders({ 'x-request-id': 'client-req-12345' });
    const d = deps();
    const action = createAction(() => d)(contract, 'requests.create', ({ ctx, input }) =>
      Promise.resolve({ requestId: ctx.requestId, title: input.title }),
    );

    const result = await action({ title: 'Pedido' });

    expect(result).toEqual({ ok: true, data: { requestId: 'client-req-12345', title: 'Pedido' } });
    expect(d.logger.find('action finished')?.bindings).toMatchObject({
      requestId: 'client-req-12345',
    });
  });

  it('reemplaza un x-request-id inválido por uno generado', async () => {
    setHeaders({ 'x-request-id': 'bad id\n' });
    const action = createAction(() => deps())(contract, null, ({ ctx, input }) =>
      Promise.resolve({ requestId: ctx.requestId, title: input.title }),
    );

    const result = await action({ title: 'Pedido' });

    expect(result).toEqual({ ok: true, data: { requestId: sequentialUuid(1), title: 'Pedido' } });
  });

  it('sin x-request-id genera uno y lo devuelve en el error', async () => {
    setHeaders({});
    const action = createAction(() => deps(null))(contract, null, () =>
      Promise.resolve({ requestId: 'x', title: 'x' }),
    );

    const result = await action({ title: 'Pedido' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      requestId: sequentialUuid(1),
    });
  });

  it('pasa las cabeceras de la petición al resolver del ctx', async () => {
    setHeaders({ cookie: 'sb=abc' });
    const d = deps();
    const resolveCtx = vi.fn(d.resolveCtx);
    const action = createAction(() => ({ ...d, resolveCtx }))(contract, null, ({ input }) =>
      Promise.resolve({ requestId: 'x', title: input.title }),
    );

    await action({ title: 'Pedido' });

    expect(resolveCtx.mock.calls[0]?.[0].headers.get('cookie')).toBe('sb=abc');
  });

  it('usa options.name como nombre de la acción en el log', async () => {
    setHeaders({});
    const d = deps();
    const action = createAction(() => d)(
      contract,
      null,
      ({ input }) => Promise.resolve({ requestId: 'x', title: input.title }),
      { name: 'submitRequest' },
    );

    await action({ title: 'Pedido' });

    expect(d.logger.find('action finished')?.bindings).toMatchObject({
      action: 'submitRequest',
    });
  });
});
