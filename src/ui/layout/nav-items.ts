// Ítems del menú lateral. Cada ítem puede exigir un permiso; el filtro se activa cuando exista
// el ctx con sesión (E1-H2). Las rutas nuevas se agregan con su historia (E3-H2: Nueva solicitud).
import type { Route } from 'next';

import type { Permission } from '@/shared/permissions';
import { messages } from '@/ui/messages/es-PE';

export interface NavItem {
  readonly href: Route;
  readonly label: string;
  readonly permission?: Permission;
}

export const APP_NAV: readonly NavItem[] = [
  { href: '/bandeja', label: messages.nav.inbox, permission: 'requests.read_own' },
];

/** Sin permisos (todavía no hay ctx) se muestran todos; con permisos, solo los permitidos. */
export function visibleNavItems(
  items: readonly NavItem[],
  permissions?: ReadonlySet<Permission>,
): NavItem[] {
  if (!permissions) return [...items];
  return items.filter((item) => !item.permission || permissions.has(item.permission));
}
