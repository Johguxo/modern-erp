// Corregir una línea de un SOF en aprobación o aprobado (E4-H4): cambiar equipo, producto, cantidad,
// precio o notas, agregar una línea o quitarla, siempre con un motivo. Nunca number: cantidad y
// precio van como texto. La salida trae cómo resolvió el motor la regla de reaprobación (§4).
import { z } from 'zod';

import { CORRECTION_REASON_MAX } from '../domain/line-correction';
import { REAPPROVAL_BRANCHES } from '../domain/reapproval';
import { NOTES_MAX } from '../domain/request';

import {
  optionalTextSchema,
  optionalUuidSchema,
  quantitySchema,
  requestViewSchema,
  unitPriceSchema,
  versionSchema,
} from './shared';

/** Lo editable de una línea; el diálogo lo rellena con los valores actuales. */
const lineFields = {
  productId: z.uuid(),
  quantity: quantitySchema,
  unitPrice: unitPriceSchema,
  equipmentId: optionalUuidSchema,
  notes: optionalTextSchema(NOTES_MAX),
};

export const changeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update'), lineId: z.uuid(), ...lineFields }).strict(),
  z.object({ type: z.literal('add'), ...lineFields }).strict(),
  z.object({ type: z.literal('remove'), lineId: z.uuid() }).strict(),
]);

export const inputSchema = z.object({
  id: z.uuid(),
  version: versionSchema,
  reason: z
    .string()
    .trim()
    .min(1, 'correction_reason_required')
    .max(CORRECTION_REASON_MAX, 'correction_reason_too_long'),
  change: changeSchema,
});

export const outputSchema = requestViewSchema.extend({
  /** Cómo resolvió la regla de reaprobación (§4). */
  branch: z.enum(REAPPROVAL_BRANCHES),
  /** Se creó un paso de reconfirmación (el SOF aprobado vuelve a «En aprobación»). */
  reconfirmation: z.boolean(),
});
