'use client';

// «Más»: las pestañas menos frecuentes (Borradores, Rechazadas). Cada opción es un enlace a la
// misma bandeja con otro ?tab=. Si una de ellas está activa, el botón muestra su nombre.
import type { Route } from 'next';
import Link from 'next/link';

import type { InboxTab } from '@/modules/requests/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { messages } from '@/ui/messages/es-PE';

import { tabPillClass } from './tab-pill';

export function InboxMoreMenu({
  active,
  items,
}: {
  active: InboxTab | null;
  items: readonly { tab: InboxTab; label: string; href: Route }[];
}) {
  const current = items.find((item) => item.tab === active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={tabPillClass(current !== undefined)}
        aria-current={current ? 'page' : undefined}
      >
        {current ? current.label : messages.inbox.more}
        <span aria-hidden="true">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem key={item.tab} asChild className="min-h-11 text-sm">
            <Link href={item.href} aria-current={item.tab === active ? 'page' : undefined}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
