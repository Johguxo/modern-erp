// Corrección de una línea de un SOF ya enviado (E4-H4, flujo §4): agregar, cambiar o quitar una
// línea y calcular el total que resulta. Puro: la consulta al catálogo y la escritura las hace el
// caso de uso. Dinero con decimal.js (texto), nunca number.
import { NotFoundError, ValidationError } from '@/shared/errors';

import { lineSubtotal, sumTotal } from './money';
import { MAX_LINES, type LineInsert, type RequestLine } from './request';

/** Motivo de la corrección (también es el límite del comentario del evento). */
export const CORRECTION_REASON_MAX = 500;

/** Lo editable de una línea, ya resuelto contra el catálogo (sin `lineNo` ni subtotal). */
export interface LineValues {
  readonly productId: string;
  readonly productCode: string;
  readonly description: string;
  readonly unit: string;
  readonly equipmentId: string | null;
  /** Texto con 3 decimales. */
  readonly quantity: string;
  /** Texto con 4 decimales. */
  readonly unitPrice: string;
  readonly notes: string | null;
}

export type ResolvedLineChange =
  | { readonly type: 'update'; readonly lineId: string; readonly values: LineValues }
  | { readonly type: 'add'; readonly values: LineValues }
  | { readonly type: 'remove'; readonly lineId: string };

/** Los campos que se guardan en el evento (antes y después) y en la revisión. */
export interface LineFacts {
  readonly lineNo: number;
  readonly productId: string;
  readonly productCode: string;
  readonly description: string;
  readonly unit: string;
  readonly equipmentId: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly subtotal: string;
  readonly notes: string | null;
}

export const CORRECTABLE_FIELDS = [
  'productId',
  'equipmentId',
  'quantity',
  'unitPrice',
  'notes',
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

interface AppliedBase {
  /** Total antes y después, sobre las líneas vigentes (texto con 2 decimales). */
  readonly previousTotal: string;
  readonly newTotal: string;
}

export interface AppliedAdd extends AppliedBase {
  readonly type: 'add';
  readonly line: null;
  /** Lo que queda guardado (con su `lineNo`). */
  readonly next: LineInsert;
  readonly before: null;
  readonly after: LineFacts;
  readonly changedFields: readonly [];
}

export interface AppliedUpdate extends AppliedBase {
  readonly type: 'update';
  /** La línea vigente antes del cambio. */
  readonly line: RequestLine;
  readonly next: LineInsert;
  readonly before: LineFacts;
  readonly after: LineFacts;
  /** Campos que cambian al corregir. */
  readonly changedFields: readonly CorrectableField[];
}

export interface AppliedRemove extends AppliedBase {
  readonly type: 'remove';
  readonly line: RequestLine;
  readonly next: null;
  readonly before: LineFacts;
  readonly after: null;
  readonly changedFields: readonly [];
}

export type AppliedCorrection = AppliedAdd | AppliedUpdate | AppliedRemove;

export function factsOf(line: LineFacts): LineFacts {
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
  };
}

function findActive(lines: readonly RequestLine[], lineId: string): RequestLine {
  const found = lines.find((line) => line.id === lineId && line.status === 'active');
  if (!found) {
    throw new NotFoundError({
      reason: 'line_not_found',
      message: `Active line ${lineId} not found in the request`,
    });
  }
  return found;
}

const FIELD_VALUE: Readonly<
  Record<CorrectableField, (line: Pick<RequestLine, CorrectableField>) => string | null>
> = {
  productId: (line) => line.productId,
  equipmentId: (line) => line.equipmentId,
  quantity: (line) => line.quantity,
  unitPrice: (line) => line.unitPrice,
  notes: (line) => line.notes,
};

/**
 * Aplica el cambio a las líneas vigentes y calcula el total anterior y el nuevo.
 * - `line_not_found` (404) si la línea no existe o ya estaba quitada.
 * - `line_unchanged` (422) si corregir no cambia ningún campo.
 * - `last_line` (422) si quitar deja la solicitud sin líneas vigentes.
 * - `too_many_lines` (422) si agregar pasa del máximo.
 * - `amount_too_large` (422) si el total no cabe en la base.
 */
export function applyLineCorrection(
  lines: readonly RequestLine[],
  change: ResolvedLineChange,
): AppliedCorrection {
  const active = lines.filter((line) => line.status === 'active');
  const previousTotal = sumTotal(active.map((line) => line.subtotal));

  if (change.type === 'remove') {
    const line = findActive(lines, change.lineId);
    if (active.length <= 1) {
      throw new ValidationError({
        reason: 'last_line',
        fieldErrors: { lineId: ['last_line'] },
        message: 'The last active line of a request cannot be removed',
      });
    }
    return {
      type: 'remove',
      line,
      next: null,
      before: factsOf(line),
      after: null,
      changedFields: [],
      previousTotal,
      newTotal: sumTotal(active.filter((other) => other.id !== line.id).map((l) => l.subtotal)),
    };
  }

  const subtotal = lineSubtotal(change.values.quantity, change.values.unitPrice);

  if (change.type === 'add') {
    if (active.length >= MAX_LINES) {
      throw new ValidationError({
        reason: 'too_many_lines',
        params: { max: MAX_LINES },
        fieldErrors: { lines: ['too_many_lines'] },
        message: `More than ${MAX_LINES} lines`,
      });
    }
    // Las quitadas conservan su número: el nuevo es siempre el siguiente libre.
    const lineNo = lines.reduce((max, line) => Math.max(max, line.lineNo), 0) + 1;
    const next: LineInsert = { lineNo, ...change.values, subtotal };
    return {
      type: 'add',
      line: null,
      next,
      before: null,
      after: factsOf(next),
      changedFields: [],
      previousTotal,
      newTotal: sumTotal([...active.map((line) => line.subtotal), subtotal]),
    };
  }

  const line = findActive(lines, change.lineId);
  const next: LineInsert = { lineNo: line.lineNo, ...change.values, subtotal };
  const changedFields = CORRECTABLE_FIELDS.filter(
    (field) => FIELD_VALUE[field](line) !== FIELD_VALUE[field](next),
  );
  if (changedFields.length === 0) {
    throw new ValidationError({
      reason: 'line_unchanged',
      fieldErrors: { lineId: ['line_unchanged'] },
      message: `Correction of line ${line.id} changes nothing`,
    });
  }
  return {
    type: 'update',
    line,
    next,
    before: factsOf(line),
    after: factsOf(next),
    changedFields,
    previousTotal,
    newTotal: sumTotal(active.map((other) => (other.id === line.id ? subtotal : other.subtotal))),
  };
}

/** Motivo sin espacios en los bordes; `correction_reason_required` si queda vacío o `too_long` si pasa el máximo. */
export function normalizeCorrectionReason(raw: string | null | undefined): string {
  const reason = raw?.trim() ?? '';
  if (reason === '') {
    throw new ValidationError({
      reason: 'correction_reason_required',
      fieldErrors: { reason: ['correction_reason_required'] },
      message: 'A correction needs a reason',
    });
  }
  if (reason.length > CORRECTION_REASON_MAX) {
    throw new ValidationError({
      reason: 'correction_reason_too_long',
      params: { max: CORRECTION_REASON_MAX },
      fieldErrors: { reason: ['correction_reason_too_long'] },
      message: `Correction reason longer than ${CORRECTION_REASON_MAX}`,
    });
  }
  return reason;
}
