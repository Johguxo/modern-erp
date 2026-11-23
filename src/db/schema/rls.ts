// Políticas RLS reutilizables (ADR-004 §5 y §11). Regla: la política dice QUÉ FILAS; los grants
// (migración custom inmediata a la generada) dicen QUÉ OPERACIONES puede hacer app_user.
import { sql, type SQL } from 'drizzle-orm';
import { pgPolicy, pgRole, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** Rol de la app web; lo crea la migración 0000 (no lo gestiona drizzle-kit). */
export const appUser = pgRole('app_user').existing();

/** Tenant activo de la transacción (null fuera de withTenant). */
export const currentTenantId = sql`(select app.current_tenant_id())`;
/** Usuario de la transacción (null fuera de withTenant/withUser). */
export const currentUserId = sql`(select app.current_user_id())`;

/** Plantilla de ADR-004: app_user solo ve y escribe filas del tenant activo. */
export function tenantIsolation(column: AnyPgColumn, name = 'tenant_isolation') {
  const sameTenant: SQL = sql`${column} = ${currentTenantId}`;
  return pgPolicy(name, { for: 'all', to: appUser, using: sameTenant, withCheck: sameTenant });
}

/** Tablas solo-insert (auditoría, eventos, movimientos): leer e insertar en el tenant activo. */
export function appendOnlyPolicies(column: AnyPgColumn, prefix: string) {
  const sameTenant: SQL = sql`${column} = ${currentTenantId}`;
  return [
    pgPolicy(`${prefix}_read`, { for: 'select', to: appUser, using: sameTenant }),
    pgPolicy(`${prefix}_insert`, { for: 'insert', to: appUser, withCheck: sameTenant }),
  ];
}
