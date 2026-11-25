// Listar la bandeja: pestaña, búsqueda y paginación del servidor. El dinero sale como texto.
import { z } from 'zod';

import { paginationSchema } from '@/shared/pagination';

import { DEFAULT_INBOX_TAB, INBOX_TABS } from '../domain/inbox';
import { CURRENCIES } from '../domain/money';
import { REQUEST_STATUSES } from '../domain/request-state-machine';

export const SEARCH_MAX = 100;

const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

export const inputSchema = paginationSchema.extend({
  tab: z.enum(INBOX_TABS).default(DEFAULT_INBOX_TAB),
  q: z.preprocess(blankToNull, z.string().trim().max(SEARCH_MAX).nullable()),
});

export const inboxItemSchema = z.object({
  id: z.uuid(),
  docType: z.literal('SOF'),
  /** Null mientras es borrador. */
  number: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  /** El estado a mostrar: «Espera mi aprobación» cuando el paso pendiente es del usuario. */
  displayStatus: z.enum([...REQUEST_STATUSES, 'awaiting_my_approval']),
  requesterId: z.uuid(),
  requesterName: z.string().nullable(),
  /** «CODE · Nombre» del equipo, o el centro de costo; null si no tiene ninguno. */
  areaLabel: z.string().nullable(),
  currency: z.enum(CURRENCIES),
  /** Texto con 2 decimales; nunca number. */
  totalAmount: z.string(),
  updatedAt: z.iso.datetime(),
  /** Borrador del propio usuario: la bandeja lo abre en el editor. */
  isOwnDraft: z.boolean(),
});

export const outputSchema = z.object({
  items: z.array(inboxItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  summary: z.object({
    awaitingMe: z.number().int().nonnegative(),
    inApproval: z.number().int().nonnegative(),
    approvedThisWeek: z.number().int().nonnegative(),
  }),
  /** Nombre completo del usuario (para el saludo); null si no se pudo resolver. */
  viewerName: z.string().nullable(),
});
