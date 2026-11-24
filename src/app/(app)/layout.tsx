import type { ReactNode } from 'react';

import { AccountMenu } from '@/ui/layout/account-menu';
import { AppShell } from '@/ui/layout/app-shell';
import { APP_NAV, visibleNavItems } from '@/ui/layout/nav-items';
import { ReadOnlyBanner } from '@/ui/layout/read-only-banner';
import { TenantBrand } from '@/ui/layout/tenant-brand';

import { signOutAction } from '../(auth)/actions';
import { getTenantBrand } from '../_lib/company';
import { requireCtx } from '../_lib/session';

// Server action en línea: una función normal no puede pasar a un componente cliente.
async function signOut() {
  'use server';
  return signOutAction({});
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { ctx, email } = await requireCtx();
  const brand = await getTenantBrand(ctx);
  return (
    <AppShell
      items={visibleNavItems(APP_NAV, ctx.permissions)}
      banner={ctx.readOnly ? <ReadOnlyBanner /> : undefined}
      account={<AccountMenu email={email} signOut={signOut} />}
      footer={brand ? <TenantBrand {...brand} /> : undefined}
      accentColor={brand?.primaryColor}
    >
      {children}
    </AppShell>
  );
}
