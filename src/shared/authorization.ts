// Revisión de permisos (ADR-002): siempre por permiso, nunca por nombre de rol.
import type { Ctx } from './context';
import { ForbiddenError } from './errors';
import type { Permission } from './permissions';

export function hasPermission(ctx: Pick<Ctx, 'permissions'>, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Lanza ForbiddenError si el ctx no tiene el permiso. Los casos de uso la llaman siempre. */
export function requirePermission(ctx: Pick<Ctx, 'permissions'>, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
    throw new ForbiddenError({ message: `Missing permission: ${permission}` });
  }
}
