// Detalle de una solicitud: nombres resueltos, línea de tiempo y acciones disponibles.
import { z } from 'zod';

import { CURRENCIES } from '../domain/money';
import { REQUEST_ACTIONS } from '../domain/request-actions';
import { REQUEST_STATUSES } from '../domain/request-state-machine';
import { TIMELINE_KINDS, TIMELINE_STATES } from '../domain/request-timeline';

export const inputSchema = z.object({ id: z.uuid() });

export const detailLineSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  productCode: z.string(),
  description: z.string(),
  unit: z.string(),
  /** Texto con 3 decimales. */
  quantity: z.string(),
  /** Texto con 2 decimales. */
  subtotal: z.string(),
  equipmentLabel: z.string().nullable(),
  productId: z.uuid(),
  equipmentId: z.uuid().nullable(),
  notes: z.string().nullable(),
  /** Texto con 4 decimales. */
  unitPrice: z.string(),
  revision: z.number().int(),
  needsReconfirmation: z.boolean(),
  highlighted: z.boolean(),
});

export const correctionNoticeSchema = z.object({
  lineNo: z.number().int(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  changeType: z.enum(['update', 'add', 'remove']),
  changes: z.array(
    z.object({
      field: z.enum(['productId', 'equipmentId', 'quantity', 'unitPrice', 'notes']),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
  reconfirmation: z.boolean(),
});

export const timelineItemSchema = z.object({
  kind: z.enum(TIMELINE_KINDS),
  state: z.enum(TIMELINE_STATES),
  at: z.iso.datetime().nullable(),
  actorName: z.string().nullable(),
  comment: z.string().nullable(),
  stepName: z.string().nullable(),
  rule: z.enum(['any', 'all']).nullable(),
  assigneeNames: z.array(z.string()),
  assigneeCount: z.number().int().nonnegative(),
  lineNos: z.array(z.number().int()),
  changeType: z.enum(['update', 'add', 'remove']).nullable(),
});

export const outputSchema = z.object({
  id: z.uuid(),
  docType: z.literal('SOF'),
  number: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  displayStatus: z.enum([...REQUEST_STATUSES, 'awaiting_my_approval']),
  requesterId: z.uuid(),
  requesterName: z.string().nullable(),
  closedById: z.uuid().nullable(),
  costCenterLabel: z.string().nullable(),
  equipmentLabel: z.string().nullable(),
  reason: z.string().nullable(),
  currency: z.enum(CURRENCIES),
  /** Texto con 2 decimales; nunca number. */
  totalAmount: z.string(),
  version: z.number().int(),
  /** El paso pendiente del usuario; null si no le toca decidir. */
  pendingStepId: z.uuid().nullable(),
  lines: z.array(detailLineSchema),
  timeline: z.array(timelineItemSchema),
  correctionNotice: correctionNoticeSchema.nullable(),
  actions: z.array(z.enum(REQUEST_ACTIONS)),
});
