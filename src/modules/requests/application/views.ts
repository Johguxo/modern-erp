// Vistas (salida) de los casos de uso de requests: fechas en ISO 8601 (UTC) y dinero como texto.
import { formatDocumentNumber, type SequenceState } from '../domain/numbering';
import type { Request, RequestLine } from '../domain/request';

export type RequestLineView = RequestLine;

export interface RequestView {
  readonly id: string;
  readonly docType: 'SOF';
  /** Null mientras es borrador. */
  readonly number: string | null;
  readonly status: Request['status'];
  readonly requesterId: string;
  readonly costCenterId: string | null;
  readonly warehouseId: string;
  readonly equipmentId: string | null;
  readonly reason: string | null;
  readonly currency: Request['currency'];
  readonly totalAmount: string;
  readonly submittedAt: string | null;
  readonly approvedAt: string | null;
  readonly deliveredAt: string | null;
  readonly closedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lines: readonly RequestLineView[];
}

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toRequestView(request: Request, lines: readonly RequestLine[]): RequestView {
  return {
    id: request.id,
    docType: request.docType,
    number: request.number,
    status: request.status,
    requesterId: request.requesterId,
    costCenterId: request.costCenterId,
    warehouseId: request.warehouseId,
    equipmentId: request.equipmentId,
    reason: request.reason,
    currency: request.currency,
    totalAmount: request.totalAmount,
    submittedAt: iso(request.submittedAt),
    approvedAt: iso(request.approvedAt),
    deliveredAt: iso(request.deliveredAt),
    closedAt: iso(request.closedAt),
    version: request.version,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    lines: [...lines].sort((a, b) => a.lineNo - b.lineNo),
  };
}

export interface SequenceView {
  readonly docType: 'SOF';
  readonly prefix: string;
  readonly nextNumber: number;
  readonly padding: number;
  readonly lastIssuedNumber: number | null;
  /** El próximo número tal como saldrá ("SOF-0143"). */
  readonly preview: string;
}

export function toSequenceView(state: SequenceState): SequenceView {
  return {
    docType: 'SOF',
    prefix: state.prefix,
    nextNumber: state.nextNumber,
    padding: state.padding,
    lastIssuedNumber: state.lastIssuedNumber,
    preview: formatDocumentNumber(state.prefix, state.nextNumber, state.padding),
  };
}
