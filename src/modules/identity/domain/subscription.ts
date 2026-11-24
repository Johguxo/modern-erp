// Cambio de suscripción desde la consola (E1-H4, ADR-002 §3). Regla pura: el caso de uso carga la
// suscripción más reciente (la vigente si hay) y aplica lo que esta función decide.
import type { SubscriptionStatus } from './entitlements';

export const SUBSCRIPTION_STATUSES = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
] as const satisfies readonly SubscriptionStatus[];

export interface SubscriptionState {
  readonly planId: string;
  readonly status: SubscriptionStatus;
  /** subscriptions.overrides ya validado. */
  readonly overrides: Readonly<Record<string, unknown>>;
}

export type SubscriptionChange =
  | { readonly kind: 'noop' }
  /** Actualiza la vigente; `endsNow` al cancelarla. */
  | { readonly kind: 'update'; readonly endsNow: boolean }
  /** No hay vigente (o solo canceladas) y el nuevo estado no es cancelado: fila nueva. */
  | { readonly kind: 'create' };

/** max_users del formulario: null = "el del plan" (se quita la clave); un número = override. */
export function withMaxUsers(
  overrides: Readonly<Record<string, unknown>>,
  maxUsers: number | null,
): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'max_users'));
  return maxUsers === null ? rest : { ...rest, max_users: maxUsers };
}

function sameOverrides(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

export function planSubscriptionChange(
  latest: SubscriptionState | null,
  next: SubscriptionState,
): SubscriptionChange {
  if (!latest || latest.status === 'cancelled') {
    return next.status === 'cancelled' ? { kind: 'noop' } : { kind: 'create' };
  }
  const unchanged =
    latest.planId === next.planId &&
    latest.status === next.status &&
    sameOverrides(latest.overrides, next.overrides);
  if (unchanged) return { kind: 'noop' };
  return { kind: 'update', endsNow: next.status === 'cancelled' };
}
