'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { messages } from '@/ui/messages/es-PE';

/** Cierra la sesión con la acción que recibe (src/ui no importa src/app) y vuelve a /login. */
export function SignOutButton({ signOut }: { signOut: () => Promise<unknown> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          router.replace('/login');
          router.refresh();
        })
      }
      className="inline-flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left font-medium text-nav-text hover:bg-ink-2 hover:text-surface focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:outline-none disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {messages.auth.signOut}
    </button>
  );
}
