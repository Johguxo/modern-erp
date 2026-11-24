// Pestañas del catálogo: Productos · Equipos · Centros de costo. Son enlaces de navegación
// (aria-current en la activa), no un tablist: cada sección es su propia página.
import type { Route } from 'next';
import Link from 'next/link';

import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

export type CatalogSection = keyof typeof messages.catalog.sections;

const SECTIONS: readonly { readonly key: CatalogSection; readonly href: Route }[] = [
  { key: 'products', href: '/configuracion/productos' },
  { key: 'equipment', href: '/configuracion/equipos' as Route },
  { key: 'costCenters', href: '/configuracion/centros-de-costo' as Route },
];

export function CatalogTabs({ active }: { active: CatalogSection }) {
  return (
    <nav aria-label={messages.catalog.sectionsLabel} className="mb-6 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {SECTIONS.map(({ key, href }) => {
          const current = key === active;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center border-b-2 px-4 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  current
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {messages.catalog.sections[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
