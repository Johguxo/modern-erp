// Servicio Entitlements (ADR-002 §3): límites del plan, funcionalidades y modo solo lectura.
// Recibe tenantId (no ctx) porque el resolver de sesión (E1-H2) lo usa antes de tener el ctx.
// Los casos de uso lo reciben en `deps`.
import { hasFeature, isReadOnly, userCapacity, type UserCapacity } from '../domain/entitlements';
import type { PlanFeature } from '../domain/plan-features';

import type { EntitlementsRepository } from './ports';

export interface Entitlements {
  /** Si se puede invitar a un usuario más, con el límite y el uso para el mensaje. */
  canAddUser(tenantId: string): Promise<UserCapacity>;
  hasFeature(tenantId: string, feature: PlanFeature): Promise<boolean>;
  /** Cliente suspendido o cancelado, o sin suscripción vigente. */
  isReadOnly(tenantId: string): Promise<boolean>;
}

export function createEntitlements(deps: { repo: EntitlementsRepository }): Entitlements {
  const { repo } = deps;
  return {
    canAddUser: async (tenantId) => userCapacity(await repo.loadSnapshot(tenantId)),
    hasFeature: async (tenantId, feature) => hasFeature(await repo.loadSnapshot(tenantId), feature),
    isReadOnly: async (tenantId) => isReadOnly(await repo.loadSnapshot(tenantId)),
  };
}
