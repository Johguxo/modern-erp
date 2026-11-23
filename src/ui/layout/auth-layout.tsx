// Pantallas sin sesión (login, invitación, recuperar): tarjeta centrada con la marca LinkUs.
import type { ReactNode } from 'react';

import { BrandLogo } from './brand-logo';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <BrandLogo tone="light" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
