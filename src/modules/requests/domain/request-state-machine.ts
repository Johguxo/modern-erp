// Máquina de estados del SOF (docs/dominio/flujo-sof-aprobaciones.md §1). Funciones puras: no
// consultan permisos ni la base. Quién puede disparar cada evento lo revisan los casos de uso.
import { InvalidTransitionError } from '@/shared/errors';

export const REQUEST_STATUSES = [
  'draft',
  'in_approval',
  'changes_requested',
  'approved',
  'delivered',
  'rejected',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * `approve` es la aprobación del último paso (los pasos intermedios no cambian el estado del
 * documento: los resuelve el motor de aprobaciones, E4).
 */
export const REQUEST_EVENTS = [
  'submit',
  'cancel',
  'approve',
  'reject',
  'request_changes',
  'correct_line',
  'resubmit',
  'deliver',
] as const;
export type RequestEvent = (typeof REQUEST_EVENTS)[number];

export interface TransitionOptions {
  /**
   * Solo para `correct_line` desde `approved`: la corrección sube el total por encima de la
   * tolerancia y pide reconfirmación (§4), así que el documento vuelve a `in_approval`.
   */
  readonly reconfirm?: boolean;
}

/** Estados finales: no admiten ningún evento. */
export const TERMINAL_STATUSES: readonly RequestStatus[] = ['delivered', 'rejected', 'cancelled'];

type Target = RequestStatus | ((options: TransitionOptions) => RequestStatus);

const TRANSITIONS: Readonly<
  Record<RequestStatus, Readonly<Partial<Record<RequestEvent, Target>>>>
> = {
  draft: { submit: 'in_approval', cancel: 'cancelled' },
  in_approval: {
    approve: 'approved',
    reject: 'rejected',
    request_changes: 'changes_requested',
    correct_line: 'in_approval',
    cancel: 'cancelled',
  },
  changes_requested: { resubmit: 'in_approval', cancel: 'cancelled' },
  approved: {
    correct_line: (options) => (options.reconfirm === true ? 'in_approval' : 'approved'),
    deliver: 'delivered',
    cancel: 'cancelled',
  },
  delivered: {},
  rejected: {},
  cancelled: {},
};

function targetOf(
  from: RequestStatus,
  event: RequestEvent,
  options: TransitionOptions,
): RequestStatus | null {
  const target = TRANSITIONS[from][event];
  if (target === undefined) return null;
  return typeof target === 'function' ? target(options) : target;
}

export function canTransition(from: RequestStatus, event: RequestEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

/** Estado destino, o InvalidTransitionError con `from` y `event`. */
export function nextStatus(
  from: RequestStatus,
  event: RequestEvent,
  options: TransitionOptions = {},
): RequestStatus {
  const to = targetOf(from, event, options);
  if (to === null) throw new InvalidTransitionError({ from, event });
  return to;
}

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
