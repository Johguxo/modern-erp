// E0-H3 · El pipeline de action()/route() con withTenant real: tenant del ctx en la transacción,
// aislamiento entre dos tenants (A y B) y rollback cuando el handler lanza un error de dominio.
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { fakeCtxResolver } from '@tests/support/fakes/fake-ctx-resolver';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { SequentialIdGenerator } from '@tests/support/fakes/sequential-id-generator';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runPipeline, type Handler, type PipelineDeps } from '@/app/_lib/pipeline';
import { withTenant } from '@/db';
import { closeDatabases, getDbAdmin } from '@/db/admin';
import type { Ctx } from '@/shared/context';
import type { Contract } from '@/shared/contract';
import { ConflictError } from '@/shared/errors';

import { createRlsProbeTable, dropTable, newId, probeTableName } from '../helpers/db';

const TABLE = probeTableName('_action_probe');
const table = sql.identifier(TABLE);

const ctxA = makeCtx({ tenantId: newId(), userId: newId(), permissions: ['requests.create'] });
const ctxB = makeCtx({ tenantId: newId(), userId: newId(), permissions: ['requests.create'] });

function deps(ctx: Ctx): PipelineDeps {
  return {
    resolveCtx: fakeCtxResolver(ctx).resolve,
    runInTenant: withTenant,
    clock: new FixedClock(),
    ids: new SequentialIdGenerator(),
    logger: new CapturingLogger(),
  };
}

function run<C extends Contract>(ctx: Ctx, contract: C, handler: Handler<C>, input: unknown) {
  return runPipeline(deps(ctx), contract, 'requests.create', handler, {
    name: 'probe',
    headers: new Headers(),
    requestId: `req-${newId()}`,
    rawInput: input,
  });
}

const insertContract = {
  inputSchema: z.object({ label: z.string().min(1) }),
  outputSchema: z.object({ inserted: z.number() }),
};

const insertLabel: Handler<typeof insertContract> = async ({ ctx, input, tx }) => {
  const rows = await tx.execute(
    sql`insert into public.${table} (tenant_id, label) values (${ctx.tenantId}, ${input.label}) returning label`,
  );
  return { inserted: rows.length };
};

const countContract = {
  inputSchema: z.object({ label: z.string() }),
  outputSchema: z.object({ count: z.number() }),
};

const countLabel: Handler<typeof countContract> = async ({ input, tx }) => {
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.${table} where label = ${input.label}`,
  );
  return { count: rows[0]?.count ?? -1 };
};

async function adminCount(label: string): Promise<number> {
  const rows = await getDbAdmin().execute<{ count: number }>(
    sql`select count(*)::int as count from public.${table} where label = ${label}`,
  );
  return rows[0]?.count ?? -1;
}

beforeAll(async () => {
  await createRlsProbeTable(TABLE);
});

afterAll(async () => {
  await dropTable(TABLE);
  await closeDatabases();
});

describe('action() con withTenant real', () => {
  it('dentro del handler, app.current_tenant_id() es el tenant del ctx', async () => {
    const contract = {
      inputSchema: z.object({}),
      outputSchema: z.object({ tenantId: z.string() }),
    };

    const result = await run(
      ctxA,
      contract,
      async ({ tx }) => {
        const rows = await tx.execute<{ tenant_id: string }>(
          sql`select app.current_tenant_id()::text as tenant_id`,
        );
        return { tenantId: rows[0]?.tenant_id ?? '' };
      },
      {},
    );

    expect(result).toEqual({ ok: true, data: { tenantId: ctxA.tenantId } });
  });

  it('aislamiento entre dos tenants: lo que inserta A no lo ve B', async () => {
    const label = `a-${newId()}`;

    const inserted = await run(ctxA, insertContract, insertLabel, { label });
    const seenByB = await run(ctxB, countContract, countLabel, { label });
    const seenByA = await run(ctxA, countContract, countLabel, { label });

    expect(inserted).toEqual({ ok: true, data: { inserted: 1 } });
    expect(seenByB).toEqual({ ok: true, data: { count: 0 } });
    expect(seenByA).toEqual({ ok: true, data: { count: 1 } });
    expect(await adminCount(label)).toBe(1);
  });

  it('B no puede insertar filas con el tenant de A (RLS with check) → INTERNAL', async () => {
    const label = `forged-${newId()}`;
    const forged: Handler<typeof insertContract> = async ({ input, tx }) => {
      const rows = await tx.execute(
        sql`insert into public.${table} (tenant_id, label) values (${ctxA.tenantId}, ${input.label}) returning label`,
      );
      return { inserted: rows.length };
    };

    const result = await run(ctxB, insertContract, forged, { label });

    expect(!result.ok && result.error.code).toBe('INTERNAL');
    expect(await adminCount(label)).toBe(0);
  });

  it('si el handler inserta y luego lanza ConflictError → CONFLICT y la transacción se revierte', async () => {
    const label = `rollback-${newId()}`;
    const insertThenConflict: Handler<typeof insertContract> = async (args) => {
      await insertLabel(args);
      throw new ConflictError({ message: 'stale version' });
    };

    const result = await run(ctxA, insertContract, insertThenConflict, { label });

    expect(!result.ok && result.error.code).toBe('CONFLICT');
    expect(await adminCount(label)).toBe(0);
  });
});
