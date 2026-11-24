// Ítems del menú lateral. Cada ítem puede exigir un permiso; el filtro se activa cuando exista
// el ctx con sesión (E1-H2). Las rutas nuevas se agregan con su historia (E3-H2: Nueva solicitud).
import type { Route } from 'next';

import type { Permission } from '@/shared/permissions';
import { messages } from '@/ui/messages/es-PE';

export interface NavItem {
  readonly href: Route;
  readonly label: string;
  readonly permission?: Permission;
  /** Rutas extra donde el ítem también se marca activo (p. ej. las pestañas del catálogo). */
  readonly activePrefixes?: readonly string[];
}

/** El ítem está activo en su ruta, en sus subrutas y en los prefijos extra declarados. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href as string, ...(item.activePrefixes ?? [])].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const APP_NAV: readonly NavItem[] = [
  { href: '/bandeja', label: messages.nav.inbox, permission: 'requests.read_own' },
  {
    href: '/configuracion/productos' as Route, // TEMP: quitar el cast cuando exista la página
    label: messages.nav.catalog,
    permission: 'catalog.manage',
    activePrefixes: ['/configuracion/equipos', '/configuracion/centros-de-costo'],
  },
  { href: '/configuracion/usuarios', label: messages.nav.users, permission: 'users.manage' },
  { href: '/configuracion/empresa', label: messages.nav.company, permission: 'settings.manage' },
];

/** Sin permisos (todavía no hay ctx) se muestran todos; con permisos, solo los permitidos. */
export function visibleNavItems(
  items: readonly NavItem[],
  permissions?: ReadonlySet<Permission>,
): NavItem[] {
  if (!permissions) return [...items];
  return items.filter((item) => !item.permission || permissions.has(item.permission));
}

/** Menú de la consola LinkUs (E1-H4): solo SuperAdmins llegan a /admin. */
export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin/clientes', label: messages.admin.nav.tenants },
];
