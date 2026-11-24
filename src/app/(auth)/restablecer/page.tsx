import type { Metadata } from 'next';
import Link from 'next/link';

import { PASSWORD_MIN } from '@/modules/identity/contracts';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { ResetForm } from './reset-form';

// El token viaja en la URL: que no se filtre a otros sitios por el Referer.
export const metadata: Metadata = { referrer: 'no-referrer' };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">{messages.auth.resetTitle}</h1>
      <p className="mt-1 mb-4 text-muted-foreground">
        {messages.auth.resetDescription(PASSWORD_MIN)}
      </p>
      {tokenHash ? (
        <ResetForm tokenHash={tokenHash} />
      ) : (
        <div className="flex flex-col gap-4">
          <FormError message={messages.auth.resetMissingToken} />
          <Link href="/recuperar" className="text-center text-primary hover:underline">
            {messages.auth.forgotPassword}
          </Link>
        </div>
      )}
    </>
  );
}
