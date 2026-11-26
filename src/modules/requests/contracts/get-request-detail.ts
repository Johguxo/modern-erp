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
});

export const timelineItemSchema = z.object({
  kind: z.enum(TIMELINE_KINDS),
  state: z.enum(TIMELINE_STATES),
  at: z.iso.datetime().nullable(),
  actorName: z.string().nullable(),
  comment: z.string().nullable(),
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
  lines: z.array(detailLineSchema),
  timeline: z.array(timelineItemSchema),
  actions: z.array(z.enum(REQUEST_ACTIONS)),
});
