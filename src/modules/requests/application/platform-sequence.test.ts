// E3-H1 · Secuencia SOF desde la consola (ADR-007) con un store en memoria: se repite la revisión de
// SuperAdmin dentro de la transacción, se filtra por tenantId y se audita como platform_admin.
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import type { PlatformCtx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { SequenceState } from '../domain/numbering';

import { platformGetDocumentSequence } from './platform-get-document-sequence';
import { platformUpdateDocumentSequence } from './platform-update-document-sequence';
import type { PlatformSequenceDeps, SequenceRepository } from './ports';

const ADMIN: PlatformCtx = { userId: 'admin-1', requestId: 'req-1' };
const STRANGER: PlatformCtx = { userId: 'stranger', requestId: 'req-2' };
const TENANT = '11111111-1111-4111-8111-111111111111';
const MISSING = '99999999-9999-4999-8999-999999999999';

function setup() {
  const sequences = new Map<string, SequenceState>([
    [TENANT, { prefix: 'SOF-', nextNumber: 144, padding: 4, lastIssuedNumber: 143 }],
  ]);
  const audit: Parameters<AuditLog['record']>[0][] = [];
  const repo: SequenceRepository = {
    find: (tenantId) => Promise.resolve(sequences.get(tenantId) ?? null),
    lockForUpdate: (tenantId) => Promise.resolve(sequences.get(tenantId) ?? null),
    update(tenantId, _docType, patch) {
      const current = sequences.get(tenantId);
      if (current) sequences.set(tenantId, { ...current, ...patch });
      return Promise.resolve();
    },
  };
  const deps: PlatformSequenceDeps = {
    client: UNKNOWN_CLIENT,
    store: {
      transaction: (fn) =>
        fn({
          guard: { isPlatformAdmin: (userId) => Promise.resolve(userId === ADMIN.userId) },
          sequences: repo,
          audit: {
            record: (entry) => {
              audit.push(entry);
              return Promise.resolve();
            },
          },
        }),
    },
  };
  return { deps, sequences, audit };
}

describe('platformGetDocumentSequence', () => {
  it('devuelve la secuencia del cliente pedido', async () => {
    const { deps } = setup();

    expect(await platformGetDocumentSequence(ADMIN, { tenantId: TENANT }, deps)).toMatchObject({
      prefix: 'SOF-',
      preview: 'SOF-0144',
    });
  });

  it('quien no es SuperAdmin recibe FORBIDDEN y un cliente sin secuencia NOT_FOUND', async () => {
    const { deps } = setup();

    await expect(
      platformGetDocumentSequence(STRANGER, { tenantId: TENANT }, deps),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      platformGetDocumentSequence(ADMIN, { tenantId: MISSING }, deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('platformUpdateDocumentSequence', () => {
  it('cambia la secuencia y audita como platform_admin sobre el tenant afectado', async () => {
    const { deps, sequences, audit } = setup();

    const result = await platformUpdateDocumentSequence(
      ADMIN,
      { tenantId: TENANT, prefix: 'gr-', nextNumber: 500 },
      deps,
    );

    expect(result).toMatchObject({ changed: true, sequence: { preview: 'GR-0500' } });
    expect(sequences.get(TENANT)).toMatchObject({ prefix: 'GR-', nextNumber: 500 });
    expect(audit).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        actorUserId: ADMIN.userId,
        actorType: 'platform_admin',
        action: 'document_sequence.updated',
      }),
    ]);
  });

  it('quien no es SuperAdmin recibe FORBIDDEN y no se escribe nada', async () => {
    const { deps, sequences, audit } = setup();

    await expect(
      platformUpdateDocumentSequence(
        STRANGER,
        { tenantId: TENANT, prefix: 'GR-', nextNumber: 500 },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(sequences.get(TENANT)).toMatchObject({ prefix: 'SOF-', nextNumber: 144 });
    expect(audit).toHaveLength(0);
  });

  it('cliente inexistente: NOT_FOUND', async () => {
    const { deps } = setup();

    await expect(
      platformUpdateDocumentSequence(
        ADMIN,
        { tenantId: MISSING, prefix: 'GR-', nextNumber: 500 },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('no baja del último emitido', async () => {
    const { deps } = setup();

    await expect(
      platformUpdateDocumentSequence(
        ADMIN,
        { tenantId: TENANT, prefix: 'SOF-', nextNumber: 143 },
        deps,
      ),
    ).rejects.toMatchObject({ reason: 'sequence_below_last_used', params: { last: 143 } });
  });

  it('sin cambios no audita', async () => {
    const { deps, audit } = setup();

    const result = await platformUpdateDocumentSequence(
      ADMIN,
      { tenantId: TENANT, prefix: 'SOF-', nextNumber: 144 },
      deps,
    );

    expect(result.changed).toBe(false);
    expect(audit).toHaveLength(0);
  });
});
