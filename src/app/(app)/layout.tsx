import type { ReactNode } from 'react';

import { AppShell } from '@/ui/layout/app-shell';
import { APP_NAV, visibleNavItems } from '@/ui/layout/nav-items';

// E1-H2 pasará ctx.permissions a visibleNavItems y el aviso de solo lectura como banner.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell items={visibleNavItems(APP_NAV)}>{children}</AppShell>;
}
