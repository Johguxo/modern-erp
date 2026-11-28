// Estado puro del diálogo «Corregir una línea» (E4-H4): modos, relleno desde la línea elegida,
// precio de referencia al cambiar de producto y validación previa al envío. Sin React. Cantidad y
// precio van como texto (CLAUDE.md regla 5); aquí solo se comprueba su forma, el servidor decide.
import type { z } from 'zod';

import type { RequestDetailLine } from '@/modules/requests';
import {
  CORRECTION_REASON_MAX,
  NOTES_MAX,
  parseQuantity,
  parseUnitPrice,
  type correctLineContract,
} from '@/modules/requests/contracts';
import { trimDecimal } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

export type CorrectMode = 'update' | 'add' | 'remove';

/** Un producto del buscador del catálogo, con lo que el diálogo usa. */
export interface PickedProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly referencePrice: string | null;
}

export interface CorrectLineFormState {
  readonly mode: CorrectMode;
  /** Línea que se corrige o se quita; '' al agregar. */
  readonly lineId: string;
  readonly productId: string;
  /** «CÓDIGO · Nombre» del producto elegido, solo para mostrarlo. */
  readonly productLabel: string;
  readonly quantity: string;
  readonly unitPrice: string;
  /** '' = sin equipo. */
  readonly equipmentId: string;
  readonly notes: string;
  readonly reason: string;
}

export type CorrectLineInput = z.input<typeof correctLineContract.inputSchema>;

/** Errores por campo: `lineId`, `productId`, `quantity`, `unitPrice`, `notes`, `reason`. */
export type FormErrors = Readonly<Record<string, string>>;

const reasons = messages.errors.reasons;

const productLabelOf = (line: Pick<RequestDetailLine, 'productCode' | 'description'>): string =>
  `${line.productCode} · ${line.description}`;

const blank: CorrectLineFormState = {
  mode: 'update',
  lineId: '',
  productId: '',
  productLabel: '',
  quantity: '',
  unitPrice: '',
  equipmentId: '',
  notes: '',
  reason: '',
};

/** Los campos de la línea tal como están hoy; el motivo no se toca. */
function fromLine(state: CorrectLineFormState, line: RequestDetailLine): CorrectLineFormState {
  return {
    ...state,
    lineId: line.id,
    productId: line.productId,
    productLabel: productLabelOf(line),
    quantity: trimDecimal(line.quantity, 0),
    unitPrice: trimDecimal(line.unitPrice, 2),
    equipmentId: line.equipmentId ?? '',
    notes: line.notes ?? '',
  };
}

export function initialFormState(lines: readonly RequestDetailLine[]): CorrectLineFormState {
  const [first] = lines;
  return first ? fromLine(blank, first) : blank;
}

export function selectMode(
  state: CorrectLineFormState,
  mode: CorrectMode,
  lines: readonly RequestDetailLine[],
): CorrectLineFormState {
  if (mode === state.mode) return state;
  if (mode === 'add') {
    return { ...blank, mode, quantity: '1', reason: state.reason };
  }
  const line = lines.find((item) => item.id === state.lineId) ?? lines[0];
  return line ? fromLine({ ...state, mode }, line) : { ...blank, mode, reason: state.reason };
}

export function selectLine(
  state: CorrectLineFormState,
  lineId: string,
  lines: readonly RequestDetailLine[],
): CorrectLineFormState {
  const line = lines.find((item) => item.id === lineId);
  return line ? fromLine(state, line) : state;
}

/** Cambiar de producto trae su precio de referencia; sin precio cuenta como 0 (igual que el editor). */
export function pickProduct(
  state: CorrectLineFormState,
  product: PickedProduct,
): CorrectLineFormState {
  return {
    ...state,
    productId: product.id,
    productLabel: `${product.code} · ${product.name}`,
    unitPrice: trimDecimal(product.referencePrice ?? '0', 2),
  };
}

/** El motivo que se puede mandar: sin espacios en los bordes. */
const reasonOf = (state: CorrectLineFormState): string => state.reason.trim();

export type BuildResult =
  | { readonly ok: true; readonly input: CorrectLineInput }
  | { readonly ok: false; readonly errors: FormErrors };

export function buildInput(
  state: CorrectLineFormState,
  target: { readonly id: string; readonly version: number },
): BuildResult {
  const errors: Record<string, string> = {};
  const reason = reasonOf(state);
  if (reason === '') errors.reason = reasons.correction_reason_required();
  else if (reason.length > CORRECTION_REASON_MAX) {
    errors.reason = reasons.correction_reason_too_long({ max: CORRECTION_REASON_MAX });
  }
  if (state.mode !== 'add' && state.lineId === '') errors.lineId = reasons.line_not_found();

  if (state.mode !== 'remove') {
    if (state.productId === '')
      errors.productId = messages.requests.detail.correctLine.productRequired;
    if (parseQuantity(state.quantity.trim()) === null) errors.quantity = reasons.quantity_invalid();
    if (parseUnitPrice(state.unitPrice.trim()) === null) {
      errors.unitPrice = reasons.unit_price_invalid();
    }
    if (state.notes.trim().length > NOTES_MAX) {
      errors.notes = messages.requests.detail.correctLine.notesTooLong(NOTES_MAX);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const base = { id: target.id, version: target.version, reason };
  if (state.mode === 'remove') {
    return { ok: true, input: { ...base, change: { type: 'remove', lineId: state.lineId } } };
  }
  const fields = {
    productId: state.productId,
    quantity: state.quantity.trim(),
    unitPrice: state.unitPrice.trim(),
    equipmentId: state.equipmentId === '' ? null : state.equipmentId,
    notes: state.notes.trim() === '' ? null : state.notes.trim(),
  };
  return {
    ok: true,
    input: {
      ...base,
      change:
        state.mode === 'add'
          ? { type: 'add', ...fields }
          : { type: 'update', lineId: state.lineId, ...fields },
    },
  };
}

/**
 * Los errores del servidor por campo: el servidor los nombra con rutas como `change.quantity` o
 * `lineId`; el diálogo los ubica por el último tramo.
 */
export function serverFieldErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>> | undefined,
): FormErrors {
  const result: Record<string, string> = {};
  for (const [path, list] of Object.entries(fieldErrors ?? {})) {
    const key = path.split('.').at(-1) ?? path;
    const [first] = list;
    if (first && result[key] === undefined) result[key] = first;
  }
  return result;
}
