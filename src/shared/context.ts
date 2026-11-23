// Contexto de cada caso de uso (ADR-001 regla 6). Satisface TenantScope de @/db por estructura.
import type { Permission, Role } from './permissions';

export type Locale = 'es-PE';

export interface Ctx {
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly permissions: ReadonlySet<Permission>;
  readonly locale: Locale;
  /** Zona horaria IANA del tenant (por ejemplo, America/Lima). */
  readonly timezone: string;
  readonly requestId: string;
}
