// Solicitudes del tenant activo con la transacción de withTenant: RLS y filtro explícito por
// tenantId. app_user no borra solicitudes y solo actualiza las columnas de 0011; el DELETE de líneas
// solo pasa con la solicitud en borrador (política restrictiva).
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { isUniqueViolation, type DbExecutor } from '@/db';
import { requestLineRevisions, requestLines, requests } from '@/db/schema';
import { ConflictError, NotFoundError } from '@/shared/errors';

import type {
  HeaderInsert,
  HeaderPatch,
  LineInsert,
  LinePatch,
  RequestRepository,
  RequestWithLines,
} from '../application/ports';
import type { LineSyncPlan } from '../domain/line-sync';
import { formatAmount, formatQuantity, formatUnitPrice, type Currency } from '../domain/money';
import type { LineStatus, Request, RequestLine } from '../domain/request';
import type { RequestStatus } from '../domain/request-state-machine';

type RequestRow = typeof requests.$inferSelect;
type LineRow = typeof requestLines.$inferSelect;

// Los check constraints de la base garantizan estos valores; aquí solo se estrechan los tipos.
const asStatus = (value: string): RequestStatus => value as RequestStatus;
const asCurrency = (value: string): Currency => value as Currency;
const asLineStatus = (value: string): LineStatus => value as LineStatus;

function toRequest(row: RequestRow): Request {
  return {
    id: row.id,
    tenantId: row.tenantId,
    docType: 'SOF',
    number: row.number,
    status: asStatus(row.status),
    requesterId: row.requesterId,
    costCenterId: row.costCenterId,
    warehouseId: row.warehouseId,
    equipmentId: row.equipmentId,
    reason: row.reason,
    currency: asCurrency(row.currency),
    totalAmount: formatAmount(row.totalAmount),
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    deliveredAt: row.deliveredAt,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    closeComment: row.closeComment,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLine(row: LineRow): RequestLine {
  return {
    id: row.id,
    lineNo: row.lineNo,
    productId: row.productId,
    productCode: row.productCodeSnapshot,
    description: row.descriptionSnapshot,
    unit: row.unitSnapshot,
    equipmentId: row.equipmentId,
    quantity: formatQuantity(row.quantity),
    unitPrice: formatUnitPrice(row.unitPrice),
    subtotal: formatAmount(row.subtotal),
    notes: row.notes,
    status: asLineStatus(row.status),
    revision: row.revision,
    needsReconfirmation: row.needsReconfirmation,
  };
}

function lineValues(tenantId: string, requestId: string, line: LineInsert) {
  return {
    tenantId,
    requestId,
    lineNo: line.lineNo,
    productId: line.productId,
    productCodeSnapshot: line.productCode,
    descriptionSnapshot: line.description,
    unitSnapshot: line.unit,
    equipmentId: line.equipmentId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    subtotal: line.subtotal,
    notes: line.notes,
  };
}

function lineChanges(line: Omit<LineInsert, 'lineNo'>) {
  return {
    productId: line.productId,
    productCodeSnapshot: line.productCode,
    descriptionSnapshot: line.description,
    unitSnapshot: line.unit,
    equipmentId: line.equipmentId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    subtotal: line.subtotal,
    notes: line.notes,
  };
}

export function createDrizzleRequestRepository(db: DbExecutor): RequestRepository {
  async function insertLines(
    tenantId: string,
    requestId: string,
    lines: readonly LineInsert[],
  ): Promise<RequestLine[]> {
    if (lines.length === 0) return [];
    const rows = await db
      .insert(requestLines)
      .values(lines.map((line) => lineValues(tenantId, requestId, line)))
      .returning();
    return rows.map(toLine).sort((a, b) => a.lineNo - b.lineNo);
  }

  async function linesOf(tenantId: string, requestId: string): Promise<RequestLine[]> {
    const rows = await db
      .select()
      .from(requestLines)
      .where(and(eq(requestLines.tenantId, tenantId), eq(requestLines.requestId, requestId)))
      .orderBy(asc(requestLines.lineNo));
    return rows.map(toLine);
  }

  return {
    async create(header: HeaderInsert, lines) {
      const [row] = await db
        .insert(requests)
        .values({
          tenantId: header.tenantId,
          requesterId: header.requesterId,
          costCenterId: header.costCenterId,
          warehouseId: header.warehouseId,
          equipmentId: header.equipmentId,
          reason: header.reason,
          currency: header.currency,
          totalAmount: header.totalAmount,
        })
        .returning();
      if (!row) throw new Error('Request insert returned no row');
      const inserted = await insertLines(header.tenantId, row.id, lines);
      return { request: toRequest(row), lines: inserted };
    },

    async find(tenantId, id): Promise<RequestWithLines | null> {
      const [row] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.tenantId, tenantId), eq(requests.id, id)))
        .limit(1);
      if (!row) return null;
      return { request: toRequest(row), lines: await linesOf(tenantId, id) };
    },

    async lockById(tenantId, id): Promise<RequestWithLines | null> {
      const [row] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.tenantId, tenantId), eq(requests.id, id)))
        .for('update')
        .limit(1);
      if (!row) return null;
      return { request: toRequest(row), lines: await linesOf(tenantId, id) };
    },

    async replaceLines(tenantId, requestId, lines) {
      // Solo en borrador (la política de la base lo exige); después del envío, `syncLines`.
      await db
        .delete(requestLines)
        .where(and(eq(requestLines.tenantId, tenantId), eq(requestLines.requestId, requestId)));
      return insertLines(tenantId, requestId, lines);
    },

    async syncLines(tenantId, requestId, plan: LineSyncPlan) {
      const scope = and(eq(requestLines.tenantId, tenantId), eq(requestLines.requestId, requestId));
      for (const update of plan.updates) {
        // app_user solo actualiza las columnas de la línea (0011): sin tenant_id ni request_id.
        const line = update.line;
        await db
          .update(requestLines)
          .set(lineChanges(line))
          .where(and(scope, eq(requestLines.id, update.id)));
      }
      if (plan.removed.length > 0) {
        await db
          .update(requestLines)
          .set({ status: 'removed' })
          .where(and(scope, inArray(requestLines.id, [...plan.removed])));
      }
      await insertLines(tenantId, requestId, plan.inserts);
      return linesOf(tenantId, requestId);
    },

    async updateLine(tenantId, lineId, expectedRevision, patch: LinePatch) {
      const [row] = await db
        .update(requestLines)
        .set({
          ...(patch.values ? lineChanges(patch.values) : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          revision: expectedRevision + 1,
        })
        .where(
          and(
            eq(requestLines.tenantId, tenantId),
            eq(requestLines.id, lineId),
            eq(requestLines.revision, expectedRevision),
          ),
        )
        .returning();
      if (!row) {
        throw new ConflictError({
          reason: 'stale_version',
          message: `Line ${lineId} is not at revision ${expectedRevision}`,
        });
      }
      return toLine(row);
    },

    async insertLine(tenantId, requestId, line) {
      const [inserted] = await insertLines(tenantId, requestId, [line]);
      if (!inserted) throw new Error('Line insert returned no row');
      return inserted;
    },

    async appendRevision(tenantId, revision) {
      // La línea debe ser de este tenant y de esta solicitud: la FK sola no lo garantiza.
      const [line] = await db
        .select({ id: requestLines.id })
        .from(requestLines)
        .where(
          and(
            eq(requestLines.tenantId, tenantId),
            eq(requestLines.requestId, revision.requestId),
            eq(requestLines.id, revision.requestLineId),
          ),
        )
        .limit(1);
      if (!line) throw new NotFoundError({ message: 'Request line not found' });
      await db.insert(requestLineRevisions).values({
        tenantId,
        requestId: revision.requestId,
        requestLineId: revision.requestLineId,
        revision: revision.revision,
        snapshot: revision.snapshot,
        changedBy: revision.changedBy,
        reason: revision.reason,
      });
    },

    async flagReconfirmation(tenantId, lineId) {
      await db
        .update(requestLines)
        .set({ needsReconfirmation: true })
        .where(and(eq(requestLines.tenantId, tenantId), eq(requestLines.id, lineId)));
    },

    async clearReconfirmation(tenantId, requestId) {
      await db
        .update(requestLines)
        .set({ needsReconfirmation: false })
        .where(
          and(
            eq(requestLines.tenantId, tenantId),
            eq(requestLines.requestId, requestId),
            eq(requestLines.needsReconfirmation, true),
          ),
        );
    },

    async updateHeader(tenantId, id, expectedVersion, patch: HeaderPatch) {
      let row: RequestRow | undefined;
      try {
        [row] = await db
          .update(requests)
          .set({
            ...(patch.costCenterId !== undefined ? { costCenterId: patch.costCenterId } : {}),
            ...(patch.equipmentId !== undefined ? { equipmentId: patch.equipmentId } : {}),
            ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
            ...(patch.totalAmount !== undefined ? { totalAmount: patch.totalAmount } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.number !== undefined ? { number: patch.number } : {}),
            ...(patch.submittedAt !== undefined ? { submittedAt: patch.submittedAt } : {}),
            ...(patch.approvedAt !== undefined ? { approvedAt: patch.approvedAt } : {}),
            ...(patch.closedAt !== undefined ? { closedAt: patch.closedAt } : {}),
            ...(patch.closedBy !== undefined ? { closedBy: patch.closedBy } : {}),
            ...(patch.closeComment !== undefined ? { closeComment: patch.closeComment } : {}),
            version: sql`${requests.version} + 1`,
          })
          .where(
            and(
              eq(requests.tenantId, tenantId),
              eq(requests.id, id),
              eq(requests.version, expectedVersion),
            ),
          )
          .returning();
      } catch (error) {
        if (isUniqueViolation(error, 'requests_tenant_doc_number_key')) {
          throw new ConflictError({
            reason: 'number_taken',
            params: { number: patch.number ?? '' },
            message: 'Document number already used in this tenant',
          });
        }
        throw error;
      }
      if (!row) {
        throw new ConflictError({
          reason: 'stale_version',
          message: `Request ${id} is not at version ${expectedVersion}`,
        });
      }
      return toRequest(row);
    },
  };
}
