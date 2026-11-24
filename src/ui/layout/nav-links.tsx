'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/ui/lib/utils';

import type { NavItem } from './nav-items';

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'relative flex min-h-11 items-center rounded-md px-3 font-medium text-nav-text transition-colors hover:bg-ink-2 hover:text-surface focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:outline-none',
                active &&
                  'bg-ink-2 text-surface before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--tenant-accent,var(--brand-accent))]',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
