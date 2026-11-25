// E3-H1 · Secuencia SOF: paso de alta (createTenant), idempotencia, backfill de la migración 0011,
// reglas de edición (empresa y consola), FORBIDDEN/NOT_FOUND de la consola y auditoría.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, documentSequences } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import { createPlatformStore, createTenant, type PlatformDeps } from '@/modules/identity';
import {
  createDraft,
  createPlatformSequenceDeps,
  createSequenceDeps,
  documentSequenceSetupStep,
  getDocumentSequence,
  platformGetDocumentSequence,
  platformUpdateDocumentSequence,
  submitRequest,
  updateDocumentSequence,
} from '@/modules/requests';
import type { PlatformCtx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { createIdentityFixtures, randomEmail, randomSlug } from '../helpers/identity-fixtures';
import { draftInput, runRequests, seedRequestsWorld } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let superAdmin: PlatformCtx;
let stranger: PlatformCtx;

beforeAll(async () => {
  const admin = await fx.user();
  await fx.platformAdmin(admin.id);
  superAdmin = { userId: admin.id, requestId: 'req-seq' };
  stranger = { userId: (await fx.user()).id, requestId: 'req-seq-2' };
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const sequenceOf = async (tenantId: string) => {
  const rows = await getDbAdmin()
    .select()
    .from(documentSequences)
    .where(eq(documentSequences.tenantId, tenantId));
  return rows;
};

function platformDeps(config?: { prefix: string; nextNumber: number }): PlatformDeps {
  return {
    store: createPlatformStore([documentSequenceSetupStep(config)], getDbAdmin()),
    mailer: { send: () => Promise.resolve({ messageId: 'm' }) },
    clock: new FixedClock(new Date()),
    logger: new CapturingLogger(),
    client: UNKNOWN_CLIENT,
    afterCommit: () => undefined,
    appUrl: 'http://localhost:3000',
  };
}

const newTenantInput = () => ({
  name: 'Cliente secuencia',
  slug: randomSlug(),
  planCode: 'starter',
  maxUsers: null,
  currency: 'PEN' as const,
  adminEmail: randomEmail(),
});

describe('paso de alta', () => {
  it('createTenant crea la secuencia SOF con el prefijo y el correlativo del alta', async () => {
    const created = await createTenant(
      superAdmin,
      newTenantInput(),
      platformDeps({ prefix: 'GR-', nextNumber: 500 }),
    );
    fx.trackTenant(created.tenantId);

    const [row, ...others] = await sequenceOf(created.tenantId);

    expect(others).toHaveLength(0);
    expect(row).toMatchObject({
      docType: 'SOF',
      prefix: 'GR-',
      nextNumber: 500,
      padding: 4,
      lastIssuedNumber: null,
    });
  });

  it('sin configuración usa SOF- y 1', async () => {
    const created = await createTenant(superAdmin, newTenantInput(), platformDeps());
    fx.trackTenant(created.tenantId);

    expect((await sequenceOf(created.tenantId))[0]).toMatchObject({
      prefix: 'SOF-',
      nextNumber: 1,
    });
  });

  it('solo inserta en el tenant recibido y es idempotente (no pisa una secuencia existente)', async () => {
    const one = await fx.tenant();
    const other = await fx.tenant();
    const step = documentSequenceSetupStep({ prefix: 'AAA-', nextNumber: 7 })(getDbAdmin());

    await step.run({ tenantId: one.id });
    await documentSequenceSetupStep({ prefix: 'ZZZ-', nextNumber: 99 })(getDbAdmin()).run({
      tenantId: one.id,
    });

    expect(await sequenceOf(one.id)).toHaveLength(1);
    expect((await sequenceOf(one.id))[0]).toMatchObject({ prefix: 'AAA-', nextNumber: 7 });
    expect(await sequenceOf(other.id)).toHaveLength(0);
  });

  it('un alta que falla no deja secuencia (misma transacción)', async () => {
    const input = newTenantInput();
    const deps = platformDeps({ prefix: 'GR-', nextNumber: 1 });

    await expect(
      createTenant(superAdmin, { ...input, planCode: 'no-existe' }, deps),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const rows = await getDbAdmin().execute<{ n: number }>(
      sql`select count(*)::int as n from document_sequences s join tenants t on t.id = s.tenant_id where t.slug = ${input.slug}`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe('backfill de la migración 0011', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0011_requests_privileges.sql'),
    'utf8',
  );
  const backfill = migration.slice(migration.indexOf('insert into document_sequences'));

  it('crea SOF-0001 para un tenant existente sin secuencia, sin tocar a los demás, y es idempotente', async () => {
    const legacy = await fx.tenant();
    const withSequence = await fx.tenant();
    await documentSequenceSetupStep({ prefix: 'GR-', nextNumber: 500 })(getDbAdmin()).run({
      tenantId: withSequence.id,
    });
    const before = await sequenceOf(withSequence.id);

    // Acotado a estos dos tenants: el backfill real toca todos, y en paralelo otras pruebas crean
    // y borran tenants (la FK fallaría en una carrera).
    const scoped = backfill.replace(
      'where not exists',
      `where t.id in ('${legacy.id}', '${withSequence.id}') and not exists`,
    );
    expect(scoped).not.toBe(backfill);
    await getDbAdmin().execute(sql.raw(scoped));
    await getDbAdmin().execute(sql.raw(scoped));

    const created = await sequenceOf(legacy.id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      docType: 'SOF',
      prefix: 'SOF-',
      nextNumber: 1,
      padding: 4,
      lastIssuedNumber: null,
    });
    expect(await sequenceOf(withSequence.id)).toEqual(before);
  });
});

describe('edición desde la empresa (settings.manage)', () => {
  it('cambia prefijo y siguiente número, audita y no baja del último emitido', async () => {
    const world = await seedRequestsWorld(fx, { nextNumber: 143 });
    const settings = makeCtx({
      tenantId: world.tenantId,
      userId: world.userId,
      permissions: ['settings.manage'],
    });
    const withDeps = <T>(
      ctx: typeof settings,
      fn: (deps: ReturnType<typeof createSequenceDeps>) => Promise<T>,
    ) => withTenant(ctx, (tx) => fn(createSequenceDeps(tx, { client: UNKNOWN_CLIENT })));

    // Sin envíos todavía se puede bajar y subir libremente.
    const first = await withDeps(settings, (deps) =>
      updateDocumentSequence(settings, { prefix: 'gr-', nextNumber: 500 }, deps),
    );
    expect(first).toMatchObject({ changed: true, sequence: { preview: 'GR-0500' } });

    const draft = await runRequests(world.ctx, (deps) =>
      createDraft(world.ctx, draftInput(world), deps),
    );
    const sent = await runRequests(world.ctx, (deps) =>
      submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
    );
    expect(sent.number).toBe('GR-0500');

    // Ya se emitió el 500: el siguiente debe ser mayor.
    for (const nextNumber of [500, 499, 1]) {
      await expect(
        withDeps(settings, (deps) =>
          updateDocumentSequence(settings, { prefix: 'GR-', nextNumber }, deps),
        ),
      ).rejects.toMatchObject({
        reason: 'sequence_below_last_used',
        params: { last: 500 },
        fieldErrors: { sequenceNextNumber: ['sequence_below_last_used'] },
      });
    }
    const view = await withDeps(settings, (deps) =>
      updateDocumentSequence(settings, { prefix: 'GR-', nextNumber: 600 }, deps),
    );
    expect(view.sequence).toMatchObject({ nextNumber: 600, lastIssuedNumber: 500 });

    const read = await withTenant(settings, (tx) =>
      getDocumentSequence(settings, createSequenceDeps(tx, { client: UNKNOWN_CLIENT })),
    );
    expect(read).toMatchObject({ prefix: 'GR-', nextNumber: 600, preview: 'GR-0600' });

    const audits = await getDbAdmin()
      .select({ action: auditEvents.action, actorType: auditEvents.actorType })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, world.tenantId),
          eq(auditEvents.action, 'document_sequence.updated'),
        ),
      );
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.actorType === 'user')).toBe(true);
  });

  it('sin settings.manage es FORBIDDEN', async () => {
    const world = await seedRequestsWorld(fx);

    await expect(
      withTenant(world.ctx, (tx) =>
        getDocumentSequence(world.ctx, createSequenceDeps(tx, { client: UNKNOWN_CLIENT })),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('edición desde la consola (ADR-007)', () => {
  it('el SuperAdmin cambia la secuencia de un cliente y queda auditado como platform_admin', async () => {
    const world = await seedRequestsWorld(fx, { nextNumber: 10 });
    const deps = createPlatformSequenceDeps({ client: UNKNOWN_CLIENT }, getDbAdmin());

    const result = await platformUpdateDocumentSequence(
      superAdmin,
      { tenantId: world.tenantId, prefix: 'gr-', nextNumber: 500 },
      deps,
    );

    expect(result).toMatchObject({ changed: true, sequence: { preview: 'GR-0500' } });
    expect(
      await platformGetDocumentSequence(superAdmin, { tenantId: world.tenantId }, deps),
    ).toMatchObject({ prefix: 'GR-', nextNumber: 500 });
    const [audit] = await getDbAdmin()
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, world.tenantId),
          eq(auditEvents.action, 'document_sequence.updated'),
        ),
      );
    expect(audit).toMatchObject({
      actorType: 'platform_admin',
      actorUserId: superAdmin.userId,
      entityType: 'document_sequence',
    });
  });

  it('quien no es SuperAdmin recibe FORBIDDEN y la secuencia no cambia', async () => {
    const world = await seedRequestsWorld(fx, { nextNumber: 10 });
    const deps = createPlatformSequenceDeps({ client: UNKNOWN_CLIENT }, getDbAdmin());

    await expect(
      platformUpdateDocumentSequence(
        stranger,
        { tenantId: world.tenantId, prefix: 'GR-', nextNumber: 500 },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      platformGetDocumentSequence(stranger, { tenantId: world.tenantId }, deps),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await sequenceOf(world.tenantId))[0]).toMatchObject({ prefix: 'SOF-', nextNumber: 10 });
  });

  it('un cliente inexistente o sin secuencia es NOT_FOUND', async () => {
    const withoutSequence = await fx.tenant();
    const deps = createPlatformSequenceDeps({ client: UNKNOWN_CLIENT }, getDbAdmin());

    for (const tenantId of [withoutSequence.id, '00000000-0000-4000-8000-000000000000']) {
      await expect(
        platformUpdateDocumentSequence(
          superAdmin,
          { tenantId, prefix: 'GR-', nextNumber: 500 },
          deps,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        platformGetDocumentSequence(superAdmin, { tenantId }, deps),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('la consola respeta la misma regla: no baja del último emitido', async () => {
    const world = await seedRequestsWorld(fx, { nextNumber: 143 });
    const draft = await runRequests(world.ctx, (d) => createDraft(world.ctx, draftInput(world), d));
    await runRequests(world.ctx, (d) =>
      submitRequest(world.ctx, { id: draft.id, version: draft.version }, d),
    );
    const deps = createPlatformSequenceDeps({ client: UNKNOWN_CLIENT }, getDbAdmin());

    await expect(
      platformUpdateDocumentSequence(
        superAdmin,
        { tenantId: world.tenantId, prefix: 'SOF-', nextNumber: 143 },
        deps,
      ),
    ).rejects.toMatchObject({ reason: 'sequence_below_last_used', params: { last: 143 } });
    expect((await sequenceOf(world.tenantId))[0]).toMatchObject({
      nextNumber: 144,
      lastIssuedNumber: 143,
    });
  });
});
