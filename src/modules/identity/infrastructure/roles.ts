// Roles leídos de la base: se descartan los desconocidos (el CHECK de la tabla ya los limita).
import { TENANT_ROLES, type Role } from '@/shared/permissions';

export function toRoles(values: readonly string[]): Role[] {
  return values.filter((value): value is Role =>
    (TENANT_ROLES as readonly string[]).includes(value),
  );
}
