import type { ReactNode } from 'react';

import { AccountMenu } from '@/ui/layout/account-menu';
import { AppShell } from '@/ui/layout/app-shell';
import { APP_NAV, visibleNavItems } from '@/ui/layout/nav-items';
import { ReadOnlyBanner } from '@/ui/layout/read-only-banner';

import { signOutAction } from '../(auth)/actions';
import { requireCtx } from '../_lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { ctx, email } = await requireCtx();
  return (
    <AppShell
      items={visibleNavItems(APP_NAV, ctx.permissions)}
      banner={ctx.readOnly ? <ReadOnlyBanner /> : undefined}
      account={<AccountMenu email={email} signOut={() => signOutAction({})} />}
    >
      {children}
    </AppShell>
  );
}
