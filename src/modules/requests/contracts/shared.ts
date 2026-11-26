// Esquemas comunes de los contratos de requests (solo Zod, aptos para el cliente). El cliente nunca
// envía precios, subtotales ni totales: el servidor los toma del catálogo y los calcula.
import { z } from 'zod';

import { MAX_SEQUENCE_NUMBER, PREFIX_MAX, PREFIX_PATTERN } from '../domain/numbering';
import { CURRENCIES, parseQuantity, parseUnitPrice } from '../domain/money';
import { MAX_LINES, NOTES_MAX, REASON_MAX } from '../domain/request';
import { REQUEST_STATUSES } from '../domain/request-state-machine';

/** Ausente, '' o solo espacios → null. */
const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

export const optionalUuidSchema = z.preprocess(blankToNull, z.uuid().nullable());
export const optionalTextSchema = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());

/** Cantidad como texto ("2.5", hasta 3 decimales, mayor que cero); sale canónica. Nunca number. */
export const quantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (parseQuantity(value) === null) {
      ctx.addIssue({ code: 'custom', message: 'quantity_invalid' });
    }
  })
  .transform((value) => parseQuantity(value)?.toFixed(3) ?? value);

/** Precio unitario como texto (cero o más, hasta 4 decimales); sale canónico. Nunca number. */
export const unitPriceSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (parseUnitPrice(value) === null) {
      ctx.addIssue({ code: 'custom', message: 'unit_price_invalid' });
    }
  })
  .transform((value) => parseUnitPrice(value)?.toFixed(4) ?? value);

export const lineInputSchema = z
  .object({
    productId: z.uuid(),
    quantity: quantitySchema,
    equipmentId: optionalUuidSchema,
    notes: optionalTextSchema(NOTES_MAX),
  })
  .strict();

/** Encabezado y líneas editables de un borrador (sin precios). */
export const draftFieldsSchema = z.object({
  costCenterId: optionalUuidSchema,
  equipmentId: optionalUuidSchema,
  reason: optionalTextSchema(REASON_MAX),
  lines: z.array(lineInputSchema).max(MAX_LINES),
});

export const versionSchema = z.number().int().min(1);

// ── Vistas ───────────────────────────────────────────────────────────────────────────────────

export const requestLineViewSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  productId: z.uuid(),
  productCode: z.string(),
  description: z.string(),
  unit: z.string(),
  equipmentId: z.uuid().nullable(),
  /** Texto con 3 decimales. */
  quantity: z.string(),
  /** Texto con 4 decimales. */
  unitPrice: z.string(),
  /** Texto con 2 decimales. */
  subtotal: z.string(),
  notes: z.string().nullable(),
  status: z.enum(['active', 'removed']),
  revision: z.number().int(),
  needsReconfirmation: z.boolean(),
});

export const requestViewSchema = z.object({
  id: z.uuid(),
  docType: z.literal('SOF'),
  number: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  requesterId: z.uuid(),
  costCenterId: z.uuid().nullable(),
  warehouseId: z.uuid(),
  equipmentId: z.uuid().nullable(),
  reason: z.string().nullable(),
  currency: z.enum(CURRENCIES),
  /** Texto con 2 decimales; nunca number. */
  totalAmount: z.string(),
  submittedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  closedBy: z.uuid().nullable(),
  closeComment: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(requestLineViewSchema),
});

// ── Secuencia de numeración ──────────────────────────────────────────────────────────────────

export const sequencePrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(PREFIX_MAX)
  .regex(PREFIX_PATTERN);

/** Entero ≥ 1. Acepta texto del formulario ("500"); '' no es válido. */
export const sequenceNextNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_SEQUENCE_NUMBER - 1);

/** Los dos campos de la secuencia, tal como los piden el alta del cliente y los formularios. */
export const sequenceSetupFieldsSchema = z.object({
  sequencePrefix: sequencePrefixSchema,
  sequenceNextNumber: sequenceNextNumberSchema,
});

export const sequenceViewSchema = z.object({
  docType: z.literal('SOF'),
  prefix: z.string(),
  nextNumber: z.number().int(),
  padding: z.number().int(),
  lastIssuedNumber: z.number().int().nullable(),
  /** El próximo número tal como saldrá ("SOF-0143"). */
  preview: z.string(),
});

export const sequenceUpdateOutputSchema = z.object({
  sequence: sequenceViewSchema,
  changed: z.boolean(),
});
