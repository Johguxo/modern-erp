// E2-H3 · Casos de uso de la importación con fakes: vista previa, creación del trabajo, proceso
// del worker (estados, permisos, lotes, resumen y auditoría) y lectura del estado.
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';
import type { JobPayload, JobQueue } from '@/shared/ports/job-queue';
import {
  SPREADSHEET_LIMITS,
  type SpreadsheetCell,
  type SpreadsheetReader,
} from '@/shared/ports/spreadsheet';

import { importPayloadSchema } from '../contracts/import';
import { IMPORT_LIMITS, extractRows, type ImportKind } from '../domain/import';

import { createImportJob } from './create-import-job';
import { getImportJob } from './get-import-job';
import type {
  BulkUpsertRepository,
  ImportCreateDeps,
  ImportJobRecord,
  ImportJobRepository,
  ImportProcessDeps,
  UpsertManyResult,
} from './import-ports';
import { previewImport } from './preview-import';
import { readImportRows } from './read-import-rows';
import { failImportJob, processImportJob } from './process-import-job';

const MANAGER = makeCtx({ roles: ['admin'], permissions: ['catalog.manage'] });
const REQUESTER = makeCtx({ permissions: ['requests.create'] });
const FILE = { name: 'datos.csv', bytes: new Uint8Array([1]) };

const HEADER: SpreadsheetCell[] = ['codigo', 'nombre', 'unidad', 'precio'];
const sheet = (...rows: SpreadsheetCell[][]) => [HEADER, ...rows];

class MemoryJobs implements ImportJobRepository {
  readonly jobs = new Map<string, ImportJobRecord>();
  counter = 0;

  create(
    _tenantId: string,
    input: { kind: ImportKind; createdBy: string; payload: unknown },
  ): Promise<{ id: string }> {
    this.counter += 1;
    const id = `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
    this.jobs.set(id, {
      id,
      kind: input.kind,
      status: 'pending',
      createdBy: input.createdBy,
      payload: input.payload,
      summary: {},
      errors: [],
      createdAt: new Date('2026-11-24T10:00:00Z'),
      finishedAt: null,
    });
    return Promise.resolve({ id });
  }

  lockById(_tenantId: string, id: string) {
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  findById(tenantId: string, id: string) {
    return this.lockById(tenantId, id);
  }

  complete(_tenantId: string, id: string, result: { summary: unknown; errors: unknown }) {
    const job = this.jobs.get(id);
    if (job) this.jobs.set(id, { ...job, status: 'completed', payload: null, ...result });
    return Promise.resolve();
  }

  fail(_tenantId: string, id: string, reason: string) {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, {
        ...job,
        status: 'failed',
        payload: null,
        summary: { failureReason: reason },
      });
    }
    return Promise.resolve();
  }
}

class MemoryUpsert<F extends object> implements BulkUpsertRepository<F> {
  readonly batches: (F & { code: string })[][] = [];
  constructor(private readonly result: (rows: readonly unknown[]) => UpsertManyResult) {}

  upsertManyByCode(_tenantId: string, rows: readonly (F & { readonly code: string })[]) {
    this.batches.push([...rows]);
    return Promise.resolve(this.result(rows));
  }
}

const allCreated = (rows: readonly unknown[]): UpsertManyResult => ({
  created: rows.length,
  updated: 0,
  unchanged: 0,
});

function auditSpy() {
  const events: Parameters<AuditLog['record']>[0][] = [];
  const audit: AuditLog = {
    record: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
  return { audit, events };
}

function createDeps(
  rows: readonly (readonly SpreadsheetCell[])[],
  currency: 'PEN' | 'USD' = 'PEN',
) {
  const jobs = new MemoryJobs();
  const queued: { payload: JobPayload; options: unknown }[] = [];
  const tasks: (() => Promise<Readonly<Record<string, unknown>> | void>)[] = [];
  const queue: JobQueue = {
    enqueue: (_name, payload, options) => {
      queued.push({ payload, options });
      return Promise.resolve('queue-1');
    },
  };
  const { audit, events } = auditSpy();
  const deps: ImportCreateDeps = {
    tenantCurrency: () => Promise.resolve(currency),
    importJobs: jobs,
    queue,
    afterCommit: (task) => tasks.push(task),
    audit,
    client: UNKNOWN_CLIENT,
  };
  /** Filas ya extraídas del archivo, como las entrega readImportRows a la vista previa y al job. */
  const input = (kind: ImportKind = 'products') => ({ kind, rows: extractRows(rows, kind) });
  return { deps, jobs, queued, tasks, events, input };
}

function processDeps(
  jobs: MemoryJobs,
  size?: { products?: (rows: readonly unknown[]) => UpsertManyResult },
) {
  const { audit, events } = auditSpy();
  const products = new MemoryUpsert(size?.products ?? allCreated);
  const equipment = new MemoryUpsert(allCreated);
  const deps: ImportProcessDeps = {
    importJobs: jobs,
    products,
    equipment,
    audit,
    client: UNKNOWN_CLIENT,
  };
  return { deps, products, equipment, events };
}

describe('previewImport', () => {
  it('devuelve totales, las primeras 20 filas y todos los errores sin guardar nada', async () => {
    const body: SpreadsheetCell[][] = Array.from({ length: 25 }, (_, i) => [
      `P-${i}`,
      'Tubo',
      'UND',
      null,
    ]);
    body[3] = ['P-3', null, 'UND', null];
    const { deps, jobs, input } = createDeps(sheet(...body));

    const result = await previewImport(MANAGER, input(), deps);

    expect(result).toMatchObject({ kind: 'products', total: 25, valid: 24, failed: 1 });
    expect(result.rows).toHaveLength(IMPORT_LIMITS.previewRows);
    expect(result.rows[0]).toEqual({
      row: 2,
      values: {
        code: 'P-0',
        name: 'Tubo',
        unit: 'UND',
        category: null,
        price: null,
        currency: null,
      },
    });
    expect(result.errors).toEqual([
      { row: 5, code: 'P-3', field: 'name', reason: 'required', params: {} },
    ]);
    expect(jobs.jobs.size).toBe(0);
  });

  it('sin catalog.manage → ForbiddenError (quien solo crea SOF no importa)', async () => {
    const { deps, input } = createDeps(sheet(['P-1', 'Tubo', 'UND', null]));
    await expect(previewImport(REQUESTER, input(), deps)).rejects.toThrow(ForbiddenError);
  });
});

describe('readImportRows', () => {
  const reading = (rows: readonly (readonly SpreadsheetCell[])[]) => {
    let calls = 0;
    const reader: SpreadsheetReader = {
      readFirstSheet: () => {
        calls += 1;
        return Promise.resolve(rows);
      },
    };
    return { reader, calls: () => calls };
  };

  it('devuelve las filas de datos con su número de fila de la hoja', async () => {
    const { reader } = reading(sheet(['P-1', 'Tubo', 'UND', null]));

    const rows = await readImportRows(MANAGER, { kind: 'products', ...FILE }, { reader });

    expect(rows).toEqual([
      {
        row: 2,
        values: {
          code: 'P-1',
          name: 'Tubo',
          unit: 'UND',
          category: null,
          price: null,
          currency: null,
        },
      },
    ]);
  });

  it('un archivo sin las columnas obligatorias → missing_columns', async () => {
    const { reader } = reading([['codigo'], ['P-1']]);
    await expect(
      readImportRows(MANAGER, { kind: 'products', ...FILE }, { reader }),
    ).rejects.toMatchObject({ reason: 'missing_columns' });
  });

  it('sin catalog.manage → ForbiddenError y no lee el archivo', async () => {
    const { reader, calls } = reading(sheet(['P-1', 'Tubo', 'UND', null]));
    await expect(
      readImportRows(REQUESTER, { kind: 'products', ...FILE }, { reader }),
    ).rejects.toThrow(ForbiddenError);
    expect(calls()).toBe(0);
  });

  it('los errores del lector se propagan tal cual (ValidationError con su reason)', async () => {
    const reader: SpreadsheetReader = {
      readFirstSheet: () => Promise.reject(new ValidationError({ reason: 'file_unsupported' })),
    };
    await expect(
      readImportRows(MANAGER, { kind: 'products', ...FILE }, { reader }),
    ).rejects.toMatchObject({ reason: 'file_unsupported' });
  });

  it('el tope de filas del lector es el del dominio', () => {
    expect(SPREADSHEET_LIMITS.maxDataRows).toBe(IMPORT_LIMITS.maxRows);
  });
});

describe('createImportJob', () => {
  it('guarda las filas SIN validar con la moneda de la empresa, y encola después del commit', async () => {
    const { deps, jobs, queued, tasks, input } = createDeps(
      sheet(['p-1', 'Tubo', 'und', '12.5'], ['P-2', null, 'UND', null]),
      'USD',
    );

    const result = await createImportJob(MANAGER, input(), deps);

    expect(result.queued).toBe(false);
    const job = jobs.jobs.get(result.jobId);
    expect(job).toMatchObject({ status: 'pending', kind: 'products', createdBy: MANAGER.userId });
    const payload = importPayloadSchema.parse(job?.payload);
    expect(payload.defaultCurrency).toBe('USD');
    // Sin validar: el código sigue como lo escribió el usuario y la fila inválida también viaja.
    expect(payload.rows.map((r) => [r.row, r.values.code])).toEqual([
      [2, 'p-1'],
      [3, 'P-2'],
    ]);

    // Nada se encola hasta el commit.
    expect(queued).toEqual([]);
    expect(tasks).toHaveLength(1);
    await expect(tasks[0]?.()).resolves.toEqual({ queued: true });
    expect(queued).toEqual([
      {
        payload: {
          tenantId: MANAGER.tenantId,
          userId: MANAGER.userId,
          jobId: result.jobId,
          requestId: MANAGER.requestId,
        },
        options: { singletonKey: result.jobId, singletonSeconds: 3600 },
      },
    ]);
  });

  it('sin filas válidas → no_valid_rows y no crea el trabajo', async () => {
    const { deps, jobs, tasks, input } = createDeps(sheet([null, 'Tubo', 'UND', null]));

    await expect(createImportJob(MANAGER, input(), deps)).rejects.toMatchObject({
      reason: 'no_valid_rows',
    });
    expect(jobs.jobs.size).toBe(0);
    expect(tasks).toEqual([]);
  });

  it('sin catalog.manage → ForbiddenError', async () => {
    const { deps, input } = createDeps(sheet(['P-1', 'Tubo', 'UND', null]));
    await expect(createImportJob(REQUESTER, input(), deps)).rejects.toThrow(ForbiddenError);
  });
});

/** Trabajo pendiente creado como lo crea createImportJob. */
async function pendingJob(rows: SpreadsheetCell[][], kind: ImportKind = 'products') {
  const env = createDeps(kind === 'products' ? sheet(...rows) : [['codigo', 'nombre'], ...rows]);
  const { jobId } = await createImportJob(MANAGER, env.input(kind), env.deps);
  return { jobs: env.jobs, jobId };
}

describe('processImportJob', () => {
  const input = (jobId: string) => ({ tenantId: MANAGER.tenantId, jobId });

  it('valida, hace el upsert, cierra con resumen y errores, borra el payload y audita una vez', async () => {
    const { jobs, jobId } = await pendingJob([
      ['P-1', 'Tubo', 'UND', '1'],
      ['P-2', 'Codo', 'UND', null],
      ['P-3', null, 'UND', null],
      ['p-1', 'Repetido', 'UND', null],
    ]);
    const { deps, products, events } = processDeps(jobs, {
      products: () => ({ created: 1, updated: 1, unchanged: 0 }),
    });

    const outcome = await processImportJob(MANAGER, input(jobId), deps);

    const summary = { total: 4, created: 1, updated: 1, unchanged: 0, failed: 2 };
    expect(outcome).toEqual({ status: 'completed', summary });
    expect(products.batches).toHaveLength(1);
    expect(products.batches[0]?.map((r) => r.code)).toEqual(['P-1', 'P-2']);
    const job = jobs.jobs.get(jobId);
    expect(job).toMatchObject({ status: 'completed', payload: null, summary });
    expect(job?.errors).toEqual([
      { row: 4, code: 'P-3', field: 'name', reason: 'required', params: {} },
      {
        row: 5,
        code: 'P-1',
        field: 'code',
        reason: 'duplicate_in_file',
        params: { firstRow: 2 },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: MANAGER.tenantId,
      actorUserId: MANAGER.userId,
      action: 'import_job.completed',
      entityType: 'import_job',
      entityId: jobId,
      data: { kind: 'products', summary },
    });
  });

  it('los productos van en lotes de 500', async () => {
    const rows = Array.from({ length: 1201 }, (_, i): SpreadsheetCell[] => [
      `P-${i}`,
      'Tubo',
      'UND',
      null,
    ]);
    const { jobs, jobId } = await pendingJob(rows);
    const { deps, products } = processDeps(jobs);

    const outcome = await processImportJob(MANAGER, input(jobId), deps);

    expect(products.batches.map((b) => b.length)).toEqual([500, 500, 201]);
    expect(outcome).toMatchObject({ status: 'completed', summary: { created: 1201, failed: 0 } });
  });

  it('un equipo usa el repositorio de equipos', async () => {
    const { jobs, jobId } = await pendingJob([['E-1', 'Grúa']], 'equipment');
    const { deps, products, equipment } = processDeps(jobs);

    await processImportJob(MANAGER, input(jobId), deps);

    expect(products.batches).toEqual([]);
    expect(equipment.batches).toEqual([[{ code: 'E-1', name: 'Grúa', type: null }]]);
  });

  it('solo trabaja un job pendiente: el que ya terminó o no existe se omite', async () => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const { deps, products } = processDeps(jobs);

    expect((await processImportJob(MANAGER, input(jobId), deps)).status).toBe('completed');
    expect((await processImportJob(MANAGER, input(jobId), deps)).status).toBe('skipped');
    expect(
      (await processImportJob(MANAGER, input('00000000-0000-4000-8000-0000000000ff'), deps)).status,
    ).toBe('skipped');
    expect(products.batches).toHaveLength(1);
  });

  it.each([
    ['sin ctx (usuario o membresía inactivos)', null, 'not_allowed'],
    ['sin catalog.manage', REQUESTER, 'not_allowed'],
    [
      'otro usuario que no creó el trabajo',
      makeCtx({ userId: '99999999-9999-4999-8999-999999999999', permissions: ['catalog.manage'] }),
      'not_allowed',
    ],
    [
      'tenant en solo lectura',
      makeCtx({ permissions: ['catalog.manage'], readOnly: true }),
      'tenant_read_only',
    ],
  ])('%s → failed/%s sin tocar el catálogo', async (_name, ctx, reason) => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const { deps, products, events } = processDeps(jobs);

    const outcome = await processImportJob(ctx, input(jobId), deps);

    expect(outcome).toEqual({ status: 'failed', reason });
    expect(jobs.jobs.get(jobId)).toMatchObject({
      status: 'failed',
      payload: null,
      summary: { failureReason: reason },
    });
    expect(products.batches).toEqual([]);
    expect(events).toEqual([]);
  });

  it('un payload inválido → failed/invalid_payload', async () => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const job = jobs.jobs.get(jobId);
    if (job) jobs.jobs.set(jobId, { ...job, payload: { kind: 'products', rows: 'no' } });
    const { deps } = processDeps(jobs);

    expect(await processImportJob(MANAGER, input(jobId), deps)).toEqual({
      status: 'failed',
      reason: 'invalid_payload',
    });
  });

  it('un error del upsert se propaga (el handler revierte y marca failed/unexpected)', async () => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const { deps } = processDeps(jobs, {
      products: () => {
        throw new Error('boom');
      },
    });

    await expect(processImportJob(MANAGER, input(jobId), deps)).rejects.toThrow('boom');
    expect(jobs.jobs.get(jobId)?.status).toBe('pending');
  });
});

describe('failImportJob', () => {
  it('marca failed solo si sigue pendiente', async () => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const input = { tenantId: MANAGER.tenantId, jobId, reason: 'unexpected' } as const;

    await failImportJob(input, { importJobs: jobs });
    expect(jobs.jobs.get(jobId)).toMatchObject({
      status: 'failed',
      summary: { failureReason: 'unexpected' },
    });

    // Ya terminado: no se pisa.
    await jobs.complete(MANAGER.tenantId, jobId, { summary: { total: 1 }, errors: [] });
    await failImportJob(input, { importJobs: jobs });
    expect(jobs.jobs.get(jobId)?.status).toBe('completed');
  });
});

describe('getImportJob', () => {
  const NOW = new Date('2026-11-24T10:04:00Z');

  async function view(mutate: (job: ImportJobRecord) => ImportJobRecord, now = NOW) {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const job = jobs.jobs.get(jobId);
    if (job) jobs.jobs.set(jobId, mutate(job));
    return getImportJob(MANAGER, { id: jobId }, { importJobs: jobs, clock: new FixedClock(now) });
  }

  it('pendiente reciente no está atascado; pasados 5 minutos sí', async () => {
    expect((await view((j) => j)).stalled).toBe(false);
    expect((await view((j) => j, new Date('2026-11-24T10:05:01Z'))).stalled).toBe(true);
  });

  it('terminado: resumen y errores; el atascado solo aplica a pendientes', async () => {
    const result = await view(
      (j) => ({
        ...j,
        status: 'completed',
        payload: null,
        summary: { total: 2, created: 1, updated: 0, unchanged: 0, failed: 1 },
        errors: [{ row: 3, code: 'P-2', field: 'name', reason: 'required', params: {} }],
        finishedAt: new Date('2026-11-24T10:00:05Z'),
      }),
      new Date('2026-11-24T12:00:00Z'),
    );

    expect(result).toMatchObject({
      status: 'completed',
      stalled: false,
      failureReason: null,
      summary: { total: 2, created: 1, failed: 1 },
      finishedAt: '2026-11-24T10:00:05.000Z',
    });
    expect(result.errors).toHaveLength(1);
  });

  it('fallido: expone la razón', async () => {
    const result = await view((j) => ({
      ...j,
      status: 'failed',
      summary: { failureReason: 'not_allowed' },
    }));
    expect(result).toMatchObject({ status: 'failed', failureReason: 'not_allowed', summary: null });
  });

  it('un trabajo inexistente → NotFoundError; sin catalog.manage → ForbiddenError', async () => {
    const { jobs, jobId } = await pendingJob([['P-1', 'Tubo', 'UND', null]]);
    const deps = { importJobs: jobs, clock: new FixedClock(NOW) };

    await expect(
      getImportJob(MANAGER, { id: '00000000-0000-4000-8000-0000000000ff' }, deps),
    ).rejects.toThrow(NotFoundError);
    await expect(getImportJob(REQUESTER, { id: jobId }, deps)).rejects.toThrow(ForbiddenError);
  });
});
