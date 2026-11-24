'use client';

import { Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/ui/components/sheet';
import { messages } from '@/ui/messages/es-PE';

import { BrandLogo } from './brand-logo';
import type { NavItem } from './nav-items';
import { NavLinks } from './nav-links';

const ICON_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-md text-surface focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:outline-none';

/** Barra superior del celular con el menú en un panel lateral (Sheet). */
export function MobileNav({ items, account }: { items: NavItem[]; account?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-14 items-center justify-between bg-ink px-4 md:hidden">
      <BrandLogo />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label={messages.nav.openMenu} className={ICON_BUTTON}>
          <Menu aria-hidden className="size-6" />
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-64 border-ink-2 bg-ink p-4 text-nav-text"
        >
          <SheetTitle className="sr-only">{messages.nav.mainLabel}</SheetTitle>
          <div className="mb-6 flex items-center justify-between">
            <BrandLogo />
            <SheetClose aria-label={messages.nav.closeMenu} className={ICON_BUTTON}>
              <X aria-hidden className="size-6" />
            </SheetClose>
          </div>
          <nav aria-label={messages.nav.mainLabel}>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </nav>
          {account ? <div className="mt-6">{account}</div> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
