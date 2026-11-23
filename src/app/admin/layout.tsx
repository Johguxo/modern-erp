import type { ReactNode } from 'react';

import { AppShell } from '@/ui/layout/app-shell';
import { ConsoleBanner } from '@/ui/layout/console-banner';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell items={[]} banner={<ConsoleBanner />}>
      {children}
    </AppShell>
  );
}
