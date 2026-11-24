import type { ReactNode } from 'react';

import { AccountMenu } from '@/ui/layout/account-menu';
import { AppShell } from '@/ui/layout/app-shell';
import { ConsoleBanner } from '@/ui/layout/console-banner';

import { signOutAction } from '../(auth)/actions';
import { requirePlatformAdmin } from '../_lib/session';

// Solo SuperAdmins (platform_admins); el resto ve 404. La consola llega en E1-H4.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requirePlatformAdmin();
  return (
    <AppShell
      items={[]}
      banner={<ConsoleBanner />}
      account={<AccountMenu email={email} signOut={() => signOutAction({})} />}
    >
      {children}
    </AppShell>
  );
}
