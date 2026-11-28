// Vistas (salida) de los casos de uso de requests: fechas en ISO 8601 (UTC) y dinero como texto.
import { formatDocumentNumber, type SequenceState } from '../domain/numbering';
import type { DisplayStatus } from '../domain/inbox';
import type { Request, RequestLine } from '../domain/request';
import type { RequestAction } from '../domain/request-actions';
import type { TimelineItem, TimelineKind, TimelineState } from '../domain/request-timeline';

import { changeTypeOf, lineNosOf } from './correction-data';

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
  /** Quién anuló y su comentario (E3-H5); null mientras sigue abierta. */
  readonly closedBy: string | null;
  readonly closeComment: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Mutable para encajar con la salida de los contratos Zod. */
  readonly lines: RequestLineView[];
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
    closedBy: request.closedBy,
    closeComment: request.closeComment,
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

// ── Detalle del SOF (E3-H4) ──────────────────────────────────────────────────────────────────

export interface RequestDetailLine {
  readonly id: string;
  readonly lineNo: number;
  readonly productCode: string;
  readonly description: string;
  readonly unit: string;
  /** Texto con 3 decimales. */
  readonly quantity: string;
  /** Texto con 2 decimales. */
  readonly subtotal: string;
  /** «CODE · Nombre» del equipo de la línea; null si no tiene. */
  readonly equipmentLabel: string | null;
  /** Lo que necesita el diálogo «Corregir una línea» (E4-H4). */
  readonly productId: string;
  readonly equipmentId: string | null;
  readonly notes: string | null;
  /** Texto con 4 decimales. */
  readonly unitPrice: string;
  readonly revision: number;
  readonly needsReconfirmation: boolean;
  /** La fila va resaltada: la línea del aviso o la que espera reconfirmación (solo en aprobación). */
  readonly highlighted: boolean;
}

export interface CorrectionChange {
  readonly field: 'productId' | 'equipmentId' | 'quantity' | 'unitPrice' | 'notes';
  /** Valor para mostrar: código del producto o del equipo, o el texto tal cual; null si no había. */
  readonly from: string | null;
  readonly to: string | null;
}

/** El aviso de la última corrección de la ronda vigente (prototipo, pantalla 3). */
export interface CorrectionNotice {
  readonly lineNo: number;
  /** Quién corrigió; el detalle lo usa para saber si quien mira fue él. */
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly changeType: 'update' | 'add' | 'remove';
  /** Vacío al agregar o quitar una línea. */
  readonly changes: CorrectionChange[];
  /** La corrección pidió que otros aprobadores la reconfirmen. */
  readonly reconfirmation: boolean;
}

export interface TimelineItemView {
  readonly kind: TimelineKind;
  readonly state: TimelineState;
  /** ISO 8601 (UTC); null si aún no ocurre. */
  readonly at: string | null;
  readonly actorName: string | null;
  /** Comentario del hito (la anulación guarda el suyo); null si no tiene. */
  readonly comment: string | null;
  /** Nombre del paso tal como lo escribió el admin; null si el hito no es de un paso. */
  readonly stepName: string | null;
  /** Regla del paso: `any` espera a uno de los asignados, `all` a todos. */
  readonly rule: 'any' | 'all' | null;
  /** Los asignados que aún no deciden (paso pendiente), por nombre; los sin nombre se omiten. */
  readonly assigneeNames: string[];
  /** Cuántos asignados aún no deciden, tengan nombre o no (0: el paso no tiene aprobadores). */
  readonly assigneeCount: number;
  /** Líneas que nombra la corrección o la reconfirmación (E4-H4); vacío en los demás hitos. */
  readonly lineNos: number[];
  /** Solo en `line_corrected`: si la línea se actualizó, se agregó o se quitó. */
  readonly changeType: 'update' | 'add' | 'remove' | null;
}

export interface RequestDetail {
  readonly id: string;
  readonly docType: 'SOF';
  /** Null mientras es borrador. */
  readonly number: string | null;
  readonly status: Request['status'];
  /** «Espera mi aprobación» cuando el paso pendiente es del usuario. */
  readonly displayStatus: DisplayStatus;
  readonly requesterId: string;
  readonly requesterName: string | null;
  /** Quién cerró (anuló) el documento; null si sigue abierto. */
  readonly closedById: string | null;
  readonly costCenterLabel: string | null;
  /** «CODE · Nombre» del equipo de la cabecera. */
  readonly equipmentLabel: string | null;
  readonly reason: string | null;
  readonly currency: Request['currency'];
  readonly totalAmount: string;
  readonly version: number;
  /** El paso pendiente del usuario (es lo que decide); null si no le toca decidir. */
  readonly pendingStepId: string | null;
  /** Solo líneas activas, por número de línea. Mutable para encajar con los contratos Zod. */
  readonly lines: RequestDetailLine[];
  readonly timeline: TimelineItemView[];
  /** La última corrección de la ronda vigente, mientras el SOF sigue en aprobación, aprobado o entregado. */
  readonly correctionNotice: CorrectionNotice | null;
  readonly actions: RequestAction[];
}

export function toTimelineItems(
  items: readonly TimelineItem[],
  names: ReadonlyMap<string, string>,
): TimelineItemView[] {
  return items.map((item) => ({
    kind: item.kind,
    state: item.state,
    at: iso(item.at),
    actorName: item.actorId ? (names.get(item.actorId) ?? null) : null,
    comment: item.comment,
    stepName: item.stepName,
    rule: item.rule,
    assigneeNames: item.assigneeIds
      .flatMap((id) => {
        const name = names.get(id);
        return name ? [name] : [];
      })
      .sort((a, b) => a.localeCompare(b, 'es-PE')),
    assigneeCount: item.assigneeIds.length,
    lineNos: lineNosOf(item),
    changeType: changeTypeOf(item),
  }));
}
