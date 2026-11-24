import type { AccessStatus, EntitlementSnapshot } from '../domain/entitlements';

export interface EntitlementsRepository {
  /** Foto del tenant para calcular límites. Lanza NotFoundError si el tenant no existe. */
  loadSnapshot(tenantId: string): Promise<EntitlementSnapshot>;
  /** Solo estados (sin conteos): para el modo solo lectura en cada request. */
  loadStatus(tenantId: string): Promise<AccessStatus>;
}
