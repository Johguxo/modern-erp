import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{messages.auth.signInTitle}</h1>
      {error === 'sin-acceso' ? (
        <FormError className="mb-4" message={messages.auth.noAccess} />
      ) : null}
      <LoginForm />
    </>
  );
}
