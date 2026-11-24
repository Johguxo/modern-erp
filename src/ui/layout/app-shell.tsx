// Estructura de las pantallas con sesión (prototipo Main.dc.html): menú lateral oscuro en
// escritorio y barra superior con menú desplegable en el celular. La usan (app) y admin.
import type { ReactNode } from 'react';

import { messages } from '@/ui/messages/es-PE';

import { BrandLogo } from './brand-logo';
import { MobileNav } from './mobile-nav';
import type { NavItem } from './nav-items';
import { NavLinks } from './nav-links';
import { accentStyle } from './tenant-brand';

export function AppShell({
  items,
  banner,
  footer,
  account,
  accentColor,
  children,
}: {
  items: NavItem[];
  /** Franja superior (por ejemplo, "Consola LinkUs" o el aviso de solo lectura). */
  banner?: ReactNode;
  /** Pie del menú (marca del cliente, E1-H5). */
  footer?: ReactNode;
  /** Cuenta de la sesión (correo y cerrar sesión). */
  account?: ReactNode;
  /** Color principal del cliente (#RRGGBB validado): acento del ítem activo (E1-H5). */
  accentColor?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background md:flex" style={accentStyle(accentColor)}>
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-4 py-6 md:flex">
        <div className="mb-8 px-3">
          <BrandLogo />
        </div>
        <nav aria-label={messages.nav.mainLabel} className="flex-1">
          <NavLinks items={items} />
        </nav>
        {account}
        {footer ? <div className="mt-4 border-t border-ink-2 px-3 pt-4">{footer}</div> : null}
      </aside>
      <div className="min-w-0 flex-1">
        <MobileNav items={items} account={account} footer={footer} accentColor={accentColor} />
        {banner}
        <main className="p-4 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
