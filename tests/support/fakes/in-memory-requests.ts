// Solicitudes en memoria para las pruebas de corrección de líneas (E4-H4). Imita el repositorio
// Drizzle: la versión y la revisión se comprueban igual y las revisiones de línea solo reciben
// insert. `create`, `replaceLines` y `syncLines` no se usan en estas pruebas.
import type {
  HeaderPatch,
  LineInsert,
  LinePatch,
  RequestRepository,
  RequestWithLines,
  RevisionInsert,
} from '@/modules/requests/application/ports';
import type { Request, RequestLine } from '@/modules/requests/domain/request';
import { ConflictError, NotFoundError } from '@/shared/errors';

export interface StoredRevision extends RevisionInsert {
  readonly tenantId: string;
}

export class InMemoryRequests implements RequestRepository {
  private readonly store = new Map<string, { request: Request; lines: RequestLine[] }>();
  readonly revisions: StoredRevision[] = [];
  readonly headerPatches: HeaderPatch[] = [];
  private seq = 0;

  seed(request: Request, lines: readonly RequestLine[]): void {
    this.store.set(request.id, { request, lines: [...lines] });
  }

  get(requestId: string): RequestWithLines {
    const found = this.store.get(requestId);
    if (!found) throw new Error(`missing request ${requestId}`);
    return { request: found.request, lines: [...found.lines] };
  }

  find(tenantId: string, id: string): Promise<RequestWithLines | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.request.tenantId === tenantId ? this.get(id) : null);
  }

  lockById(tenantId: string, id: string): Promise<RequestWithLines | null> {
    return this.find(tenantId, id);
  }

  create(): Promise<RequestWithLines> {
    return Promise.reject(new Error('not used'));
  }

  replaceLines(): Promise<RequestLine[]> {
    return Promise.reject(new Error('not used'));
  }

  syncLines(): Promise<RequestLine[]> {
    return Promise.reject(new Error('not used'));
  }

  updateLine(
    tenantId: string,
    lineId: string,
    expectedRevision: number,
    patch: LinePatch,
  ): Promise<RequestLine> {
    for (const entry of this.store.values()) {
      const index = entry.lines.findIndex((line) => line.id === lineId);
      const line = entry.lines[index];
      if (!line || entry.request.tenantId !== tenantId) continue;
      if (line.revision !== expectedRevision) {
        return Promise.reject(new ConflictError({ reason: 'stale_version' }));
      }
      const next: RequestLine = {
        ...line,
        ...(patch.values
          ? {
              productId: patch.values.productId,
              productCode: patch.values.productCode,
              description: patch.values.description,
              unit: patch.values.unit,
              equipmentId: patch.values.equipmentId,
              quantity: patch.values.quantity,
              unitPrice: patch.values.unitPrice,
              subtotal: patch.values.subtotal,
              notes: patch.values.notes,
            }
          : {}),
        ...(patch.status ? { status: patch.status } : {}),
        revision: expectedRevision + 1,
      };
      entry.lines[index] = next;
      return Promise.resolve(next);
    }
    return Promise.reject(new ConflictError({ reason: 'stale_version' }));
  }

  insertLine(tenantId: string, requestId: string, line: LineInsert): Promise<RequestLine> {
    const entry = this.store.get(requestId);
    if (!entry || entry.request.tenantId !== tenantId) {
      return Promise.reject(new NotFoundError());
    }
    this.seq += 1;
    const inserted: RequestLine = {
      id: `new-line-${this.seq}`,
      lineNo: line.lineNo,
      productId: line.productId,
      productCode: line.productCode,
      description: line.description,
      unit: line.unit,
      equipmentId: line.equipmentId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      notes: line.notes,
      status: 'active',
      revision: 1,
      needsReconfirmation: false,
    };
    entry.lines.push(inserted);
    return Promise.resolve(inserted);
  }

  appendRevision(tenantId: string, revision: RevisionInsert): Promise<void> {
    const entry = this.store.get(revision.requestId);
    const exists = entry?.lines.some((line) => line.id === revision.requestLineId);
    if (!entry || entry.request.tenantId !== tenantId || !exists) {
      return Promise.reject(new NotFoundError());
    }
    this.revisions.push({ ...revision, tenantId });
    return Promise.resolve();
  }

  flagReconfirmation(tenantId: string, lineId: string): Promise<void> {
    for (const entry of this.store.values()) {
      if (entry.request.tenantId !== tenantId) continue;
      entry.lines = entry.lines.map((line) =>
        line.id === lineId ? { ...line, needsReconfirmation: true } : line,
      );
    }
    return Promise.resolve();
  }

  clearReconfirmation(tenantId: string, requestId: string): Promise<void> {
    const entry = this.store.get(requestId);
    if (entry && entry.request.tenantId === tenantId) {
      entry.lines = entry.lines.map((line) => ({ ...line, needsReconfirmation: false }));
    }
    return Promise.resolve();
  }

  updateHeader(
    tenantId: string,
    id: string,
    expectedVersion: number,
    patch: HeaderPatch,
  ): Promise<Request> {
    const entry = this.store.get(id);
    if (
      !entry ||
      entry.request.tenantId !== tenantId ||
      entry.request.version !== expectedVersion
    ) {
      return Promise.reject(new ConflictError({ reason: 'stale_version' }));
    }
    this.headerPatches.push(patch);
    entry.request = {
      ...entry.request,
      ...(patch.totalAmount !== undefined ? { totalAmount: patch.totalAmount } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.approvedAt !== undefined ? { approvedAt: patch.approvedAt } : {}),
      version: entry.request.version + 1,
    };
    return Promise.resolve(entry.request);
  }
}
