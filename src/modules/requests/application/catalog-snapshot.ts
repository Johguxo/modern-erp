// Copia del catálogo en las líneas del SOF (compartido por crear, editar y enviar): el cliente nunca
// envía precios. El servidor valida que los productos, equipos y el centro de costo existan, estén
// activos y sean del tenant, toma de catalog código, nombre, unidad y precio, y calcula subtotales y
// total con decimal.js (HALF_UP).
import type { Ctx } from '@/shared/context';
import { ValidationError } from '@/shared/errors';

import { lineSubtotal, parseQuantity, sumTotal, type Currency } from '../domain/money';
import { MAX_LINES } from '../domain/request';

import type { CatalogLookup, CatalogProduct, LineInsert } from './ports';

/** Lo que elige el solicitante de cada línea; precio, nombre y unidad salen del catálogo. */
export interface LineDraft {
  readonly productId: string;
  /** Texto, hasta 3 decimales (G7). */
  readonly quantity: string;
  readonly equipmentId: string | null;
  readonly notes: string | null;
}

export interface HeaderRefs {
  readonly costCenterId: string | null;
  readonly equipmentId: string | null;
}

export interface ResolvedDraft {
  readonly lines: LineInsert[];
  readonly totalAmount: string;
}

/** G4: un producto sin precio de referencia se acepta con precio 0. */
const ZERO_PRICE = '0.0000';

export async function resolveDraft(
  ctx: Ctx,
  input: {
    readonly currency: Currency;
    readonly header: HeaderRefs;
    readonly lines: readonly LineDraft[];
  },
  catalog: CatalogLookup,
): Promise<ResolvedDraft> {
  if (input.lines.length > MAX_LINES) {
    throw new ValidationError({
      reason: 'too_many_lines',
      params: { max: MAX_LINES },
      fieldErrors: { lines: ['too_many_lines'] },
      message: `More than ${MAX_LINES} lines`,
    });
  }

  const { products, activeEquipment, errors, fail } = await lookupRefs(ctx, input, catalog);

  const lines: LineInsert[] = [];
  input.lines.forEach((draft, index) => {
    const path = `lines.${index}`;
    const quantity = parseQuantity(draft.quantity);
    if (!quantity) fail(`${path}.quantity`, 'quantity_invalid');
    if (draft.equipmentId && !activeEquipment.has(draft.equipmentId)) {
      fail(`${path}.equipmentId`, 'equipment_not_available');
    }
    const product = products.get(draft.productId);
    if (!product) {
      fail(`${path}.productId`, 'product_not_available');
      return;
    }
    // G3: una moneda por solicitud; un producto con precio en otra moneda no se mezcla.
    if (product.currency !== null && product.currency !== input.currency) {
      fail(`${path}.productId`, 'product_currency_mismatch');
      return;
    }
    if (!quantity) return;

    const quantityText = quantity.toFixed(3);
    const unitPrice = product.referencePrice ?? ZERO_PRICE;
    lines.push({
      lineNo: index + 1,
      productId: product.id,
      productCode: product.code,
      description: product.name,
      unit: product.unit,
      equipmentId: draft.equipmentId,
      quantity: quantityText,
      unitPrice,
      subtotal: lineSubtotal(quantityText, unitPrice),
      notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
    });
  });

  throwIfInvalid(errors);

  return { lines, totalAmount: sumTotal(lines.map((line) => line.subtotal)) };
}

interface RefsInput {
  readonly currency: Currency;
  readonly header: HeaderRefs;
  readonly lines: readonly { readonly productId: string; readonly equipmentId: string | null }[];
}

async function lookupRefs(ctx: Ctx, input: RefsInput, catalog: CatalogLookup) {
  const equipmentIds = [
    ...(input.header.equipmentId ? [input.header.equipmentId] : []),
    ...input.lines.flatMap((line) => (line.equipmentId ? [line.equipmentId] : [])),
  ];
  const found = await catalog.refs(ctx, {
    productIds: input.lines.map((line) => line.productId),
    equipmentIds,
    costCenterIds: input.header.costCenterId ? [input.header.costCenterId] : [],
  });
  const products = new Map<string, CatalogProduct>(found.products.map((p) => [p.id, p]));
  const activeEquipment = new Set(found.equipmentIds);

  const errors: Record<string, string[]> = {};
  const fail = (field: string, reason: string) => {
    (errors[field] ??= []).push(reason);
  };

  if (input.header.costCenterId && !found.costCenterIds.includes(input.header.costCenterId)) {
    fail('costCenterId', 'cost_center_not_available');
  }
  if (input.header.equipmentId && !activeEquipment.has(input.header.equipmentId)) {
    fail('equipmentId', 'equipment_not_available');
  }

  return { products, activeEquipment, errors, fail };
}

function throwIfInvalid(errors: Record<string, string[]>): void {
  const fields = Object.keys(errors);
  if (fields.length === 0) return;
  const firstField = fields[0] ?? '';
  throw new ValidationError({
    reason: errors[firstField]?.[0] ?? 'invalid',
    fieldErrors: errors,
    message: `Invalid request references: ${fields.join(', ')}`,
  });
}

/**
 * Al enviar: revalida que productos, equipos y centro de costo sigan activos y del tenant y que la
 * moneda de cada producto coincida con la de la solicitud. No toma precios: los del borrador quedan
 * congelados.
 */
export async function assertRefsStillValid(
  ctx: Ctx,
  input: RefsInput,
  catalog: CatalogLookup,
): Promise<void> {
  const { products, activeEquipment, errors, fail } = await lookupRefs(ctx, input, catalog);
  input.lines.forEach((line, index) => {
    const path = `lines.${index}`;
    if (line.equipmentId && !activeEquipment.has(line.equipmentId)) {
      fail(`${path}.equipmentId`, 'equipment_not_available');
    }
    const product = products.get(line.productId);
    if (!product) {
      fail(`${path}.productId`, 'product_not_available');
    } else if (product.currency !== null && product.currency !== input.currency) {
      fail(`${path}.productId`, 'product_currency_mismatch');
    }
  });
  throwIfInvalid(errors);
}
