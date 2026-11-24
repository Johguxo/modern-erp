import type { Metadata } from 'next';
import Link from 'next/link';

import { createInvitationServices, previewInvitation } from '@/modules/identity';
import { PASSWORD_MIN } from '@/modules/identity/contracts';
import { systemClock } from '@/shared/adapters/system-clock';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { getAuthProvider } from '../../../_lib/auth';

import { AcceptForm } from './accept-form';

// El token viaja en la URL: que no se filtre por el Referer ni lo indexen buscadores.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

const t = messages.invitation;

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(
    { token },
    {
      store: createInvitationServices().store,
      auth: await getAuthProvider(),
      clock: systemClock,
    },
  );

  if (preview.kind === 'invalid') {
    // Inválida, vencida o ya aceptada: el mismo mensaje (no revela cuál).
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">{t.invalidTitle}</h1>
        <div className="flex flex-col gap-4">
          <FormError message={messages.errors.reasons.invitation_invalid()} />
          <Link href="/login" className="text-center text-primary hover:underline">
            {messages.auth.backToSignIn}
          </Link>
        </div>
      </>
    );
  }

  const hint =
    preview.mode === 'new_account'
      ? t.newAccountHint(PASSWORD_MIN)
      : preview.mode === 'password'
        ? t.passwordHint
        : t.sessionHint(preview.email);

  return (
    <>
      <h1 className="text-2xl font-bold">{t.title(preview.tenantName)}</h1>
      <p className="mt-1 text-muted-foreground">{t.invitedEmail(preview.email)}</p>
      <p className="mt-1 mb-4 text-muted-foreground">{hint}</p>
      <AcceptForm token={token} mode={preview.mode} email={preview.email} />
    </>
  );
}
