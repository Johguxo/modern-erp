import type { ReactNode } from 'react';

import { AccountMenu } from '@/ui/layout/account-menu';
import { AppShell } from '@/ui/layout/app-shell';
import { ConsoleBanner } from '@/ui/layout/console-banner';
import { ADMIN_NAV } from '@/ui/layout/nav-items';

import { signOutAction } from '../(auth)/actions';
import { requirePlatformAdmin } from '../_lib/session';

// Server action en línea: una función normal no puede pasar a un componente cliente.
async function signOut() {
  'use server';
  return signOutAction({});
}

// Solo SuperAdmins (platform_admins); el resto ve 404 (E1-H4).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requirePlatformAdmin();
  return (
    <AppShell
      items={[...ADMIN_NAV]}
      banner={<ConsoleBanner />}
      account={<AccountMenu email={email} signOut={signOut} />}
    >
      {children}
    </AppShell>
  );
}
