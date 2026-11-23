import type { EntitlementSnapshot } from '../domain/entitlements';

export interface EntitlementsRepository {
  /** Foto del tenant para calcular límites. Lanza NotFoundError si el tenant no existe. */
  loadSnapshot(tenantId: string): Promise<EntitlementSnapshot>;
}
