// Estado puro del editor de SOF (E3-H2): reducer, totales en vivo y validaciones. Sin React ni
// acceso a datos, para probarlo sin renderizar. El total usa las mismas funciones decimal.js del
// servidor (HALF_UP), nunca `number` (CLAUDE.md regla 5).
import type { z } from 'zod';

import type { searchProductsContract } from '@/modules/catalog/contracts';
import type { RequestView } from '@/modules/requests';
import {
  MAX_LINES,
  REASON_MAX,
  incrementQuantity,
  lineSubtotal,
  parseQuantity,
  sumTotal,
} from '@/modules/requests/contracts';
import type { ActionError } from '@/shared/result';
import { trimDecimal } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

export type CatalogItem = z.output<typeof searchProductsContract.outputSchema>['items'][number];

/** Precio de un producto sin precio de referencia (G4): cuenta como 0. */
const ZERO_PRICE = '0.0000';

export interface EditorLine {
  /** Identidad estable en pantalla (no es el id del servidor: las líneas se reemplazan al guardar). */
  readonly key: string;
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  /** Texto con 4 decimales; "0.0000" si el producto no tiene precio. */
  readonly unitPrice: string;
  /** Texto que escribe el usuario ("2", "2.5"). */
  readonly quantity: string;
  /** '' = sin equipo. */
  readonly equipmentId: string;
  readonly notes: string;
}

export interface EditorErrors {
  readonly general?: string;
  /** El error pide recargar (versión vieja o documento que ya no es borrador). */
  readonly reload: boolean;
  /** Por ruta con punto: `costCenterId`, `reason`, `lines`, `lines.0.quantity`… */
  readonly fields: Readonly<Record<string, string>>;
}

export interface EditorState {
  readonly id: string | null;
  readonly version: number | null;
  /** '' = sin elegir. */
  readonly costCenterId: string;
  readonly equipmentId: string;
  readonly reason: string;
  readonly lines: readonly EditorLine[];
  readonly nextKey: number;
  readonly errors: EditorErrors;
  readonly notice: string | null;
}

export type HeaderField = 'costCenterId' | 'equipmentId' | 'reason';

export type EditorAction =
  | { readonly type: 'setHeader'; readonly field: HeaderField; readonly value: string }
  | { readonly type: 'addProduct'; readonly product: CatalogItem }
  | { readonly type: 'setQuantity'; readonly key: string; readonly value: string }
  | { readonly type: 'setLineEquipment'; readonly key: string; readonly value: string }
  | { readonly type: 'removeLine'; readonly key: string }
  | { readonly type: 'setErrors'; readonly errors: EditorErrors }
  | { readonly type: 'loaded'; readonly request: RequestView }
  | { readonly type: 'setNotice'; readonly notice: string | null };

export const NO_ERRORS: EditorErrors = { reload: false, fields: {} };

export function emptyState(): EditorState {
  return {
    id: null,
    version: null,
    costCenterId: '',
    equipmentId: '',
    reason: '',
    lines: [],
    nextKey: 0,
    errors: NO_ERRORS,
    notice: null,
  };
}

/** Estado inicial desde la vista del servidor (editar, o tras guardar). */
export function fromRequestView(request: RequestView, firstKey = 0): EditorState {
  const lines = request.lines
    .filter((line) => line.status === 'active')
    .map((line, index): EditorLine => ({
      key: `k${firstKey + index}`,
      productId: line.productId,
      code: line.productCode,
      name: line.description,
      unit: line.unit,
      unitPrice: line.unitPrice,
      quantity: trimDecimal(line.quantity, 0),
      equipmentId: line.equipmentId ?? '',
      notes: line.notes ?? '',
    }));
  return {
    id: request.id,
    version: request.version,
    costCenterId: request.costCenterId ?? '',
    equipmentId: request.equipmentId ?? '',
    reason: request.reason ?? '',
    lines,
    nextKey: firstKey + lines.length,
    errors: NO_ERRORS,
    notice: null,
  };
}

const withoutField = (errors: EditorErrors, field: string): EditorErrors => {
  if (!(field in errors.fields)) return errors;
  return {
    ...errors,
    fields: Object.fromEntries(Object.entries(errors.fields).filter(([k]) => k !== field)),
  };
};

/** Quita solo los errores de líneas (`lines` y `lines.*`); los de cabecera y el general se conservan. */
const withoutLineErrors = (errors: EditorErrors): EditorErrors => ({
  ...errors,
  fields: Object.fromEntries(
    Object.entries(errors.fields).filter(([k]) => k !== 'lines' && !k.startsWith('lines.')),
  ),
});

/** Cambiar líneas mueve los índices: los errores por línea dejan de valer, se limpian. */
const editedLines = (
  state: EditorState,
  lines: readonly EditorLine[],
  nextKey = state.nextKey,
): EditorState => ({
  ...state,
  lines,
  nextKey,
  errors: withoutLineErrors(state.errors),
  notice: null,
});

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setHeader':
      return {
        ...state,
        [action.field]: action.value,
        errors: withoutField(state.errors, action.field),
        notice: null,
      };

    case 'addProduct': {
      const { product } = action;
      const existing = state.lines.find((line) => line.productId === product.id);
      if (existing) {
        return editedLines(
          state,
          state.lines.map((line) =>
            line.key === existing.key
              ? { ...line, quantity: incrementQuantity(line.quantity) }
              : line,
          ),
        );
      }
      if (state.lines.length >= MAX_LINES) {
        return {
          ...state,
          errors: {
            ...state.errors,
            fields: {
              ...withoutLineErrors(state.errors).fields,
              lines: messages.errors.reasons.too_many_lines({ max: MAX_LINES }),
            },
          },
        };
      }
      const line: EditorLine = {
        key: `k${state.nextKey}`,
        productId: product.id,
        code: product.code,
        name: product.name,
        unit: product.unit,
        unitPrice: product.referencePrice ?? ZERO_PRICE,
        quantity: '1',
        // Una línea nueva toma el equipo de la cabecera (el usuario puede cambiarlo).
        equipmentId: state.equipmentId,
        notes: '',
      };
      return editedLines(state, [...state.lines, line], state.nextKey + 1);
    }

    case 'setQuantity':
      return editedLines(
        state,
        state.lines.map((line) =>
          line.key === action.key ? { ...line, quantity: action.value } : line,
        ),
      );

    case 'setLineEquipment':
      return editedLines(
        state,
        state.lines.map((line) =>
          line.key === action.key ? { ...line, equipmentId: action.value } : line,
        ),
      );

    case 'removeLine':
      return editedLines(
        state,
        state.lines.filter((line) => line.key !== action.key),
      );

    case 'setErrors':
      return { ...state, errors: action.errors, notice: null };

    case 'loaded':
      return fromRequestView(action.request, state.nextKey);

    case 'setNotice':
      return { ...state, notice: action.notice };
  }
}

// ── Totales en vivo ──────────────────────────────────────────────────────────────────────────

export interface Totals {
  /** Subtotal por `key` con 2 decimales; null si la cantidad no es válida (no suma). */
  readonly subtotals: Readonly<Record<string, string | null>>;
  /** Null si el monto ya no cabe en numeric(14,2). */
  readonly total: string | null;
}

export function computeTotals(lines: readonly EditorLine[]): Totals {
  const subtotals: Record<string, string | null> = {};
  const valid: string[] = [];
  let overflow = false;
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity);
    if (!quantity) {
      subtotals[line.key] = null;
      continue;
    }
    try {
      const subtotal = lineSubtotal(quantity.toFixed(3), line.unitPrice);
      subtotals[line.key] = subtotal;
      valid.push(subtotal);
    } catch {
      // amount_too_large: el servidor también lo rechaza; aquí solo se deja de mostrar el monto.
      subtotals[line.key] = null;
      overflow = true;
    }
  }
  if (overflow) return { subtotals, total: null };
  try {
    return { subtotals, total: sumTotal(valid) };
  } catch {
    return { subtotals, total: null };
  }
}

// ── Entrada de los casos de uso ──────────────────────────────────────────────────────────────

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Cuerpo de createDraft / updateDraft (sin id ni versión). El cliente nunca envía precios. */
export function toDraftInput(state: EditorState) {
  return {
    costCenterId: blankToNull(state.costCenterId),
    equipmentId: blankToNull(state.equipmentId),
    reason: blankToNull(state.reason),
    lines: state.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity.trim(),
      equipmentId: blankToNull(line.equipmentId),
      notes: blankToNull(line.notes),
    })),
  };
}

// ── Validaciones del cliente (el servidor vuelve a validar todo) ─────────────────────────────

type FieldMessages = Record<string, string>;

/** Para guardar: cantidades válidas y topes. Un borrador puede estar incompleto. */
export function validateForSave(state: EditorState): FieldMessages {
  const fields: FieldMessages = {};
  if (state.reason.trim().length > REASON_MAX) {
    fields.reason = messages.validation.tooLong(REASON_MAX);
  }
  if (state.lines.length > MAX_LINES) {
    fields.lines = messages.errors.reasons.too_many_lines({ max: MAX_LINES });
  }
  state.lines.forEach((line, index) => {
    if (parseQuantity(line.quantity) === null) {
      fields[`lines.${index}.quantity`] = messages.errors.reasons.quantity_invalid();
    }
  });
  return fields;
}

/** Para enviar: además, centro de costo, motivo y al menos un ítem (G5). */
export function validateForSubmit(state: EditorState): FieldMessages {
  const fields = validateForSave(state);
  if (state.costCenterId.trim() === '') {
    fields.costCenterId = messages.requests.validation.costCenterRequired;
  }
  if (state.reason.trim() === '') fields.reason = messages.requests.validation.reasonRequired;
  if (state.lines.length === 0) fields.lines = messages.requests.validation.linesRequired;
  return fields;
}

export const hasErrors = (fields: FieldMessages): boolean => Object.keys(fields).length > 0;

export function errorsFromFields(fields: FieldMessages): EditorErrors {
  return { reload: false, fields };
}

/** Del ActionError de una acción a los errores que pinta el editor. */
export function errorsFromAction(error: ActionError): EditorErrors {
  const fields: FieldMessages = {};
  for (const [path, list] of Object.entries(error.fieldErrors ?? {})) {
    const [first] = list;
    if (path !== 'root' && first) fields[path] = first;
  }
  return {
    general: error.message,
    reload: error.code === 'CONFLICT' || error.code === 'INVALID_TRANSITION',
    fields,
  };
}

export type LineField = 'productId' | 'quantity' | 'equipmentId';

export function lineError(
  errors: EditorErrors,
  index: number,
  field: LineField,
): string | undefined {
  return errors.fields[`lines.${index}.${field}`];
}
