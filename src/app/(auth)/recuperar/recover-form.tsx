'use client';

import Link from 'next/link';
import { useState } from 'react';

import { requestPasswordResetContract } from '@/modules/identity/contracts';
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

import { requestPasswordResetAction } from '../actions';

export function RecoverForm() {
  const [sent, setSent] = useState(false);
  const form = useZodForm(requestPasswordResetContract.inputSchema, { email: '' });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await requestPasswordResetAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">{messages.auth.recoverSent}</p>
        <Link href="/login" className="text-center text-primary hover:underline">
          {messages.auth.backToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <FormError message={form.formState.errors.root?.server?.message} />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.auth.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {messages.auth.recoverSubmit}
        </Button>
        <Link href="/login" className="text-center text-primary hover:underline">
          {messages.auth.backToSignIn}
        </Link>
      </form>
    </Form>
  );
}
