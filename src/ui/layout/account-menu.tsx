import { messages } from '@/ui/messages/es-PE';

import { SignOutButton } from './sign-out-button';

/** Bloque de cuenta del menú: correo de la sesión y "Cerrar sesión". */
export function AccountMenu({
  email,
  signOut,
}: {
  email: string;
  signOut: () => Promise<unknown>;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-ink-2 pt-4">
      <p className="px-3 text-xs text-nav-muted">
        {messages.auth.signedInAs}
        <span className="block truncate text-nav-text">{email}</span>
      </p>
      <SignOutButton signOut={signOut} />
    </div>
  );
}
