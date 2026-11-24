'use client';

// Formularios de /invitacion/[token] (E1-H3): cuenta nueva (nombre y contraseña), cuenta existente
// (su contraseña, con el correo fijo) o sesión del mismo correo (solo "Unirme").
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { AcceptMode } from '@/modules/identity';
import { acceptInvitationContract } from '@/modules/identity/contracts';
import { Button } from '@/ui/components/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';

import { acceptInvitationAction } from '../../actions';

const t = messages.invitation;

function useGoToInbox() {
  const router = useRouter();
  return () => {
    router.replace('/bandeja');
    router.refresh();
  };
}

function NewAccountForm({ token, email }: { token: string; email: string }) {
  const goToInbox = useGoToInbox();
  const form = useZodForm(acceptInvitationContract.newAccountFormSchema, {
    fullName: '',
    password: '',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await acceptInvitationAction({ mode: 'new_account', token, ...values });
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    goToInbox();
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <FormError message={form.formState.errors.root?.server?.message} />
        {/* Ayuda a los gestores de contraseñas a asociar la nueva contraseña con el correo. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.fullName}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.auth.password}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t.submitNewAccount}
        </Button>
      </form>
    </Form>
  );
}

function PasswordForm({ token, email }: { token: string; email: string }) {
  const goToInbox = useGoToInbox();
  const form = useZodForm(acceptInvitationContract.passwordFormSchema, { password: '' });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await acceptInvitationAction({ mode: 'password', token, ...values });
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    goToInbox();
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <FormError message={form.formState.errors.root?.server?.message} />
        <div className="flex flex-col gap-2">
          <label htmlFor="invitation-email" className="text-sm font-medium">
            {messages.auth.email}
          </label>
          <Input
            id="invitation-email"
            type="email"
            autoComplete="username"
            value={email}
            readOnly
          />
        </div>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.auth.password}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t.submitJoin}
        </Button>
        <Link href="/recuperar" className="text-center text-primary hover:underline">
          {messages.auth.forgotPassword}
        </Link>
      </form>
    </Form>
  );
}

function SessionJoin({ token }: { token: string }) {
  const goToInbox = useGoToInbox();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const join = () =>
    startTransition(async () => {
      const result = await acceptInvitationAction({ mode: 'session', token });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      goToInbox();
    });

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <Button type="button" disabled={pending} onClick={join}>
        {t.submitJoin}
      </Button>
    </div>
  );
}

export function AcceptForm({
  token,
  mode,
  email,
}: {
  token: string;
  mode: AcceptMode;
  email: string;
}) {
  switch (mode) {
    case 'new_account':
      return <NewAccountForm token={token} email={email} />;
    case 'password':
      return <PasswordForm token={token} email={email} />;
    case 'session':
      return <SessionJoin token={token} />;
  }
}
