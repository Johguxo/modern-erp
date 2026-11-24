// A dónde va un usuario después de iniciar sesión (E1-H2, ADR-006).
export interface EntryAccess {
  /** Usuario de la plataforma activo (null si no existe o está desactivado). */
  readonly user: { readonly id: string; readonly email: string } | null;
  /** Membresías activas (membresía y usuario activos), con el nombre de la empresa. */
  readonly memberships: readonly { readonly tenantId: string; readonly tenantName: string }[];
  readonly isPlatformAdmin: boolean;
}

export type EntryDecision =
  | { readonly kind: 'tenant'; readonly tenantId: string }
  | { readonly kind: 'choose' }
  | { readonly kind: 'platform' }
  | { readonly kind: 'no_access' };

/**
 * 1 membresía activa → entra directo; varias → elige empresa; 0 y SuperAdmin → consola; si no,
 * no tiene acceso. El estado del tenant no filtra: uno suspendido entra en solo lectura.
 */
export function decideEntry(access: EntryAccess): EntryDecision {
  if (!access.user) return { kind: 'no_access' };
  const [first, ...rest] = access.memberships;
  if (first && rest.length === 0) return { kind: 'tenant', tenantId: first.tenantId };
  if (first) return { kind: 'choose' };
  return access.isPlatformAdmin ? { kind: 'platform' } : { kind: 'no_access' };
}
