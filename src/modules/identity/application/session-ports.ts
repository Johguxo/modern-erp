// Puertos de la sesión (E1-H2). Las consultas se hacen con la conexión dueño (getDbAdmin) en
// lecturas acotadas: aún no hay ctx ni tenant activo (ADR-004 §8, ADR-006).
import type { Role } from '@/shared/permissions';

import type { EntryAccess } from '../domain/entry';

export interface TenantAccess {
  readonly userId: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly timezone: string;
  readonly locale: 'es-PE';
}

export interface SessionRepository {
  /** Usuario activo por su id de Auth, sus membresías activas y si es SuperAdmin. */
  findEntryAccess(authUserId: string): Promise<EntryAccess>;
  /** Acceso del usuario a un tenant: null si el usuario o la membresía no están activos. */
  findTenantAccess(authUserId: string, tenantId: string): Promise<TenantAccess | null>;
}
