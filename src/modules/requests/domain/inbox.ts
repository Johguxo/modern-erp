// Bandeja (E3-H3): pestañas, visibilidad y estado mostrado. Funciones puras, sin base de datos.
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import type { RequestStatus } from './request-state-machine';

/** Pestañas visibles de la bandeja, en orden. */
export const VISIBLE_TABS = ['all', 'awaiting_me', 'in_approval', 'approved'] as const;
/** Pestañas del menú «Más». */
export const MORE_TABS = ['draft', 'rejected'] as const;
export const INBOX_TABS = [...VISIBLE_TABS, ...MORE_TABS] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

/** Pestañas que filtran por un único estado del documento. «Aprobadas» es solo `approved`. */
export const TAB_STATUS = {
  in_approval: 'in_approval',
  approved: 'approved',
  draft: 'draft',
  rejected: 'rejected',
} as const satisfies Partial<Record<InboxTab, RequestStatus>>;

export const DEFAULT_INBOX_TAB: InboxTab = 'all';

/** Estado del documento, o la pastilla «Espera mi aprobación» cuando el paso pendiente es mío. */
export type DisplayStatus = RequestStatus | 'awaiting_my_approval';

export function displayStatus(status: RequestStatus, awaitingMe: boolean): DisplayStatus {
  return awaitingMe && status === 'in_approval' ? 'awaiting_my_approval' : status;
}

/**
 * Qué solicitudes puede ver el usuario en la bandeja:
 * - con `requests.read_all`: todo salvo borradores ajenos;
 * - sin él: las propias y, si no son borrador, las que tiene asignadas como aprobador.
 * Los borradores ajenos nunca se ven.
 */
export interface InboxScope {
  readonly viewerId: string;
  readonly readAll: boolean;
  /** Solicitudes donde el usuario es aprobador asignado (cualquier paso). */
  readonly assignedIds: readonly string[];
}

export function inboxScope(
  ctx: Pick<Ctx, 'userId' | 'permissions'>,
  assignedIds: readonly string[],
): InboxScope {
  return {
    viewerId: ctx.userId,
    readAll: hasPermission(ctx, 'requests.read_all'),
    assignedIds,
  };
}

/** «Esperan mi aprobación»: paso pendiente mío, en aprobación y que no la creé yo. */
export function isAwaitingMe(
  request: { readonly status: RequestStatus; readonly requesterId: string; readonly id: string },
  viewerId: string,
  pendingIds: ReadonlySet<string>,
): boolean {
  return (
    request.status === 'in_approval' &&
    request.requesterId !== viewerId &&
    pendingIds.has(request.id)
  );
}

/** Borrador propio: la bandeja lo abre en el editor. */
export function isOwnDraft(
  request: { readonly status: RequestStatus; readonly requesterId: string },
  viewerId: string,
): boolean {
  return request.status === 'draft' && request.requesterId === viewerId;
}

// ── Semana (tarjeta «Aprobadas esta semana») ────────────────────────────────────────────────────

/** Desfase (ms) de la zona respecto de UTC en ese instante: hora local menos hora UTC. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Lunes 00:00 de la semana de `now`, en la zona del tenant, como instante UTC. */
export function startOfWeek(now: Date, timeZone: string): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now.getTime(), timeZone));
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const wallMonday = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - sinceMonday,
  );
  const first = wallMonday - zoneOffsetMs(wallMonday, timeZone);
  return new Date(wallMonday - zoneOffsetMs(first, timeZone));
}
