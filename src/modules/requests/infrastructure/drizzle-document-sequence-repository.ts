// Secuencias de numeración sobre cualquier conexión: la transacción de withTenant (app_user, RLS) o
// la del dueño en la consola (ADR-007). Siempre filtra por tenantId. app_user solo actualiza
// prefix, next_number, last_issued_number y updated_at (0011).
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { documentSequences } from '@/db/schema';

import type { SequenceRepository } from '../application/ports';
import type { SequenceState } from '../domain/numbering';

const columns = {
  prefix: documentSequences.prefix,
  nextNumber: documentSequences.nextNumber,
  padding: documentSequences.padding,
  lastIssuedNumber: documentSequences.lastIssuedNumber,
};

export function createDrizzleDocumentSequenceRepository(db: DbExecutor): SequenceRepository {
  const where = (tenantId: string, docType: string) =>
    and(eq(documentSequences.tenantId, tenantId), eq(documentSequences.docType, docType));

  return {
    async find(tenantId, docType): Promise<SequenceState | null> {
      const [row] = await db
        .select(columns)
        .from(documentSequences)
        .where(where(tenantId, docType))
        .limit(1);
      return row ?? null;
    },

    async lockForUpdate(tenantId, docType): Promise<SequenceState | null> {
      const [row] = await db
        .select(columns)
        .from(documentSequences)
        .where(where(tenantId, docType))
        .for('update')
        .limit(1);
      return row ?? null;
    },

    async update(tenantId, docType, patch) {
      const values = {
        ...(patch.prefix !== undefined ? { prefix: patch.prefix } : {}),
        ...(patch.nextNumber !== undefined ? { nextNumber: patch.nextNumber } : {}),
        ...(patch.lastIssuedNumber !== undefined
          ? { lastIssuedNumber: patch.lastIssuedNumber }
          : {}),
      };
      if (Object.keys(values).length === 0) return;
      const rows = await db
        .update(documentSequences)
        .set(values)
        .where(where(tenantId, docType))
        .returning({ docType: documentSequences.docType });
      if (rows.length === 0) throw new Error('Document sequence update matched no row');
    },
  };
}
