// E2-H3 · Consumidor de `catalog.import`: ignora payloads inválidos, procesa con un solo
// withTenant, deja el trabajo en failed/unexpected si algo lanza y NUNCA relanza ni registra el
// contenido del archivo. La base y los casos de uso se simulan: se prueba solo el pegamento.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withTenant: vi.fn(),
  resolveJobCtx: vi.fn(),
  processImportJob: vi.fn(),
  failImportJob: vi.fn(),
}));

vi.mock('@/db', () => ({
  withTenant: mocks.withTenant,
  pgErrorCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
}));
vi.mock('@/modules/identity', () => ({
  createSessionServices: () => ({}),
  resolveJobCtx: mocks.resolveJobCtx,
}));
vi.mock('../application/process-import-job', () => ({
  processImportJob: mocks.processImportJob,
  failImportJob: mocks.failImportJob,
}));
vi.mock('./import-deps', () => ({ createImportProcessDeps: () => ({}) }));

import { createImportJobHandler } from './import-job-handler';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const QUEUE_JOB = (payload: Record<string, unknown>) => ({
  id: 'queue-1',
  payload: payload as { tenantId: string | null },
});
const VALID = { tenantId: TENANT, userId: USER, jobId: JOB, requestId: 'req-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTenant.mockImplementation((_scope: unknown, fn: (tx: unknown) => unknown) => fn({}));
  mocks.resolveJobCtx.mockResolvedValue({ tenantId: TENANT, userId: USER });
  mocks.processImportJob.mockResolvedValue({ status: 'completed' });
  mocks.failImportJob.mockResolvedValue(undefined);
});

describe('createImportJobHandler', () => {
  it('un payload de la cola inválido se descarta sin tocar la base', async () => {
    const logger = new CapturingLogger();

    await expect(
      createImportJobHandler({ logger })(QUEUE_JOB({ tenantId: 'no-uuid', jobId: 5 })),
    ).resolves.toBeUndefined();

    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(logger.entries.map((e) => e.level)).toEqual(['error']);
  });

  it('procesa con UN solo withTenant del tenant y el usuario del trabajo', async () => {
    const logger = new CapturingLogger();

    await createImportJobHandler({ logger })(QUEUE_JOB(VALID));

    expect(mocks.resolveJobCtx).toHaveBeenCalledWith(
      { userId: USER, tenantId: TENANT, requestId: 'req-1' },
      expect.anything(),
    );
    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
    expect(mocks.withTenant.mock.calls[0]?.[0]).toEqual({ tenantId: TENANT, userId: USER });
    expect(mocks.processImportJob).toHaveBeenCalledWith(
      { tenantId: TENANT, userId: USER },
      { tenantId: TENANT, jobId: JOB },
      expect.anything(),
    );
    expect(mocks.failImportJob).not.toHaveBeenCalled();
  });

  it('si resolveJobCtx devuelve null, igual llama al caso de uso (que lo deja failed/not_allowed)', async () => {
    mocks.resolveJobCtx.mockResolvedValue(null);

    await createImportJobHandler({ logger: new CapturingLogger() })(QUEUE_JOB(VALID));

    expect(mocks.processImportJob).toHaveBeenCalledWith(
      null,
      { tenantId: TENANT, jobId: JOB },
      expect.anything(),
    );
  });

  it('si el proceso lanza: no relanza, deja el trabajo failed/unexpected en otra transacción y no registra el contenido', async () => {
    const secret = 'Tubo-Confidencial-123';
    const error = Object.assign(
      new Error(`Failed query: insert into products ... params: ${secret}`),
      { code: '22P02' },
    );
    mocks.processImportJob.mockRejectedValue(error);
    const logger = new CapturingLogger();

    await expect(createImportJobHandler({ logger })(QUEUE_JOB(VALID))).resolves.toBeUndefined();

    expect(mocks.withTenant).toHaveBeenCalledTimes(2);
    expect(mocks.failImportJob).toHaveBeenCalledWith(
      { tenantId: TENANT, jobId: JOB, reason: 'unexpected' },
      expect.anything(),
    );
    const logged = JSON.stringify(logger.entries);
    expect(logged).toContain('22P02');
    expect(logged).not.toContain(secret);
  });

  it('si ni siquiera se puede marcar como fallido, tampoco relanza', async () => {
    mocks.processImportJob.mockRejectedValue(new Error('boom'));
    mocks.failImportJob.mockRejectedValue(new Error('db caída'));
    const logger = new CapturingLogger();

    await expect(createImportJobHandler({ logger })(QUEUE_JOB(VALID))).resolves.toBeUndefined();

    expect(logger.entries.filter((e) => e.level === 'error')).toHaveLength(2);
  });
});
