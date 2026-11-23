// Estructura de las pantallas con sesión (prototipo Main.dc.html): menú lateral oscuro en
// escritorio y barra superior con menú desplegable en el celular. La usan (app) y admin.
import type { ReactNode } from 'react';

import { messages } from '@/ui/messages/es-PE';

import { BrandLogo } from './brand-logo';
import { MobileNav } from './mobile-nav';
import type { NavItem } from './nav-items';
import { NavLinks } from './nav-links';

export function AppShell({
  items,
  banner,
  footer,
  children,
}: {
  items: NavItem[];
  /** Franja superior (por ejemplo, "Consola LinkUs" o el aviso de solo lectura). */
  banner?: ReactNode;
  /** Pie del menú (marca del cliente, E1-H5). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-4 py-6 md:flex">
        <div className="mb-8 px-3">
          <BrandLogo />
        </div>
        <nav aria-label={messages.nav.mainLabel} className="flex-1">
          <NavLinks items={items} />
        </nav>
        {footer ? <div className="px-3 text-xs text-nav-muted">{footer}</div> : null}
      </aside>
      <div className="min-w-0 flex-1">
        <MobileNav items={items} />
        {banner}
        <main className="p-4 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
