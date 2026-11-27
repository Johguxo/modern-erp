// Resuelve contra el catálogo lo que pide una corrección de línea (E4-H4): el cliente envía producto,
// equipo, cantidad, precio y notas; el servidor revisa solo lo que cambió (producto o equipo),
// toma código, nombre y unidad del catálogo y normaliza cantidad y precio con decimal.js.
import type { Ctx } from '@/shared/context';
import { NotFoundError, ValidationError } from '@/shared/errors';

import type { LineValues, ResolvedLineChange } from '../domain/line-correction';
import { parseQuantity, parseUnitPrice, type Currency } from '../domain/money';
import type { RequestLine } from '../domain/request';

import { normalizeBlank } from './normalize';
import type { CatalogLookup } from './ports';

/** Lo que pide el usuario (los valores llegan como texto). */
export type LineChangeInput =
  | {
      readonly type: 'update';
      readonly lineId: string;
      readonly productId: string;
      readonly quantity: string;
      readonly unitPrice: string;
      readonly equipmentId: string | null;
      readonly notes: string | null;
    }
  | {
      readonly type: 'add';
      readonly productId: string;
      readonly quantity: string;
      readonly unitPrice: string;
      readonly equipmentId: string | null;
      readonly notes: string | null;
    }
  | { readonly type: 'remove'; readonly lineId: string };

export async function resolveLineChange(
  ctx: Ctx,
  input: {
    readonly currency: Currency;
    readonly lines: readonly RequestLine[];
    readonly change: LineChangeInput;
  },
  catalog: CatalogLookup,
): Promise<ResolvedLineChange> {
  const { change } = input;
  if (change.type === 'remove') return change;

  const current =
    change.type === 'update'
      ? input.lines.find((line) => line.id === change.lineId && line.status === 'active')
      : undefined;
  if (change.type === 'update' && !current) {
    throw new NotFoundError({
      reason: 'line_not_found',
      message: `Active line ${change.lineId} not found in the request`,
    });
  }

  const errors: Record<string, string[]> = {};
  const fail = (field: string, reason: string) => {
    (errors[field] ??= []).push(reason);
  };

  const quantity = parseQuantity(change.quantity);
  if (!quantity) fail('quantity', 'quantity_invalid');
  const unitPrice = parseUnitPrice(change.unitPrice);
  if (!unitPrice) fail('unitPrice', 'unit_price_invalid');

  // Solo se revalida lo que cambió: el producto (y su moneda) y el equipo.
  const productChanged = !current || current.productId !== change.productId;
  const equipmentChanged =
    change.equipmentId !== null && current?.equipmentId !== change.equipmentId;
  const found =
    productChanged || equipmentChanged
      ? await catalog.refs(ctx, {
          productIds: productChanged ? [change.productId] : [],
          equipmentIds: equipmentChanged && change.equipmentId ? [change.equipmentId] : [],
          costCenterIds: [],
        })
      : null;

  let product = current
    ? {
        code: current.productCode,
        name: current.description,
        unit: current.unit,
      }
    : null;
  if (productChanged) {
    const catalogProduct = found?.products.find((candidate) => candidate.id === change.productId);
    if (!catalogProduct) {
      fail('productId', 'product_not_available');
    } else if (catalogProduct.currency !== null && catalogProduct.currency !== input.currency) {
      fail('productId', 'product_currency_mismatch');
    } else {
      product = {
        code: catalogProduct.code,
        name: catalogProduct.name,
        unit: catalogProduct.unit,
      };
    }
  }
  if (equipmentChanged && change.equipmentId && !found?.equipmentIds.includes(change.equipmentId)) {
    fail('equipmentId', 'equipment_not_available');
  }

  const fields = Object.keys(errors);
  if (fields.length > 0 || !quantity || !unitPrice || !product) {
    const first = fields[0] ?? '';
    throw new ValidationError({
      reason: errors[first]?.[0] ?? 'invalid',
      fieldErrors: errors,
      message: `Invalid line correction: ${fields.join(', ')}`,
    });
  }

  const values: LineValues = {
    productId: change.productId,
    productCode: product.code,
    description: product.name,
    unit: product.unit,
    equipmentId: change.equipmentId,
    quantity: quantity.toFixed(3),
    unitPrice: unitPrice.toFixed(4),
    notes: normalizeBlank(change.notes),
  };
  return change.type === 'update'
    ? { type: 'update', lineId: change.lineId, values }
    : { type: 'add', values };
}
