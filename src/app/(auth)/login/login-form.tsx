'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signInContract } from '@/modules/identity/contracts';
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

import { signInAction } from '../actions';

export function LoginForm() {
  const router = useRouter();
  const form = useZodForm(signInContract.inputSchema, { email: '', password: '' });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await signInAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    router.replace('/auth/continuar');
    router.refresh();
  });

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
          {messages.auth.signInSubmit}
        </Button>
        <Link href="/recuperar" className="text-center text-primary hover:underline">
          {messages.auth.forgotPassword}
        </Link>
      </form>
    </Form>
  );
}
