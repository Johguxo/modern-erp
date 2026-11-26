// Entidad Request (SOF): tipos, reglas de edición, de envío y de visibilidad. Sin base de datos.
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { InvalidTransitionError, ValidationError } from '@/shared/errors';

import type { Currency } from './money';
import type { RequestStatus } from './request-state-machine';

export const MAX_LINES = 200;
export const REASON_MAX = 500;
export const NOTES_MAX = 500;
/** Comentario obligatorio al anular (también es el check de la base). */
export const CANCEL_COMMENT_MAX = 500;

/** En E3-H1 solo se edita en borrador; «Cambios solicitados» se decide en E4-H2. */
export const EDITABLE_STATUSES: readonly RequestStatus[] = ['draft'];

export type LineStatus = 'active' | 'removed';

export interface RequestLine {
  readonly id: string;
  readonly lineNo: number;
  readonly productId: string;
  readonly productCode: string;
  readonly description: string;
  readonly unit: string;
  readonly equipmentId: string | null;
  /** Texto con 3 decimales. */
  readonly quantity: string;
  /** Texto con 4 decimales. */
  readonly unitPrice: string;
  /** Texto con 2 decimales. */
  readonly subtotal: string;
  readonly notes: string | null;
  readonly status: LineStatus;
  readonly revision: number;
  readonly needsReconfirmation: boolean;
}

export interface Request {
  readonly id: string;
  readonly tenantId: string;
  readonly docType: 'SOF';
  readonly number: string | null;
  readonly status: RequestStatus;
  readonly requesterId: string;
  readonly costCenterId: string | null;
  readonly warehouseId: string;
  readonly equipmentId: string | null;
  readonly reason: string | null;
  readonly currency: Currency;
  /** Texto con 2 decimales. */
  readonly totalAmount: string;
  readonly submittedAt: Date | null;
  readonly approvedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly closedAt: Date | null;
  /** Quién anuló la solicitud y su comentario; null mientras sigue abierta (E3-H5). */
  readonly closedBy: string | null;
  readonly closeComment: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** InvalidTransitionError (409) si el documento ya no se puede editar. */
export function assertEditable(status: RequestStatus): void {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new InvalidTransitionError({
      from: status,
      event: 'edit',
      reason: 'request_not_editable',
    });
  }
}

export interface SubmittableParts {
  readonly costCenterId: string | null;
  readonly reason: string | null;
  readonly activeLineCount: number;
}

/** G5: centro de costo, motivo y al menos una línea. El equipo de cabecera es opcional. */
export function assertSubmittable(parts: SubmittableParts): void {
  const missing: Record<string, string[]> = {};
  if (parts.costCenterId === null) missing.costCenterId = ['request_incomplete'];
  if (parts.reason === null || parts.reason.trim() === '') missing.reason = ['request_incomplete'];
  if (parts.activeLineCount < 1) missing.lines = ['request_incomplete'];
  if (Object.keys(missing).length > 0) {
    throw new ValidationError({
      reason: 'request_incomplete',
      fieldErrors: missing,
      message: `Request incomplete: ${Object.keys(missing).join(', ')}`,
    });
  }
}

/**
 * Lo que nunca se envió (sin número, sea borrador o borrador anulado) solo lo ve su solicitante.
 * Lo demás lo ve el solicitante, quien tiene `requests.read_all` o el aprobador asignado
 * (`opts.assigned`, que pone el puerto ApprovalAssignments).
 */
export function canView(
  request: Pick<Request, 'requesterId' | 'number'>,
  ctx: Pick<Ctx, 'userId' | 'permissions'>,
  opts: { readonly assigned?: boolean } = {},
): boolean {
  if (request.requesterId === ctx.userId) return true;
  if (request.number === null) return false;
  return hasPermission(ctx, 'requests.read_all') || opts.assigned === true;
}

/** Copia plana de la línea para `request_line_revisions.snapshot` (jsonb; el dinero va como texto). */
export function snapshotOf(line: RequestLine): Record<string, string | number | boolean | null> {
  return {
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
    status: line.status,
    revision: line.revision,
    needsReconfirmation: line.needsReconfirmation,
  };
}
