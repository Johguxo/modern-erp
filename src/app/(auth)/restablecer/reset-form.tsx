'use client';

import { useRouter } from 'next/navigation';

import { resetPasswordContract } from '@/modules/identity/contracts';
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

import { resetPasswordAction } from '../actions';

export function ResetForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const form = useZodForm(resetPasswordContract.inputSchema, { tokenHash, password: '' });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await resetPasswordAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    // El canje del token dejó la sesión iniciada: sigue al destino del usuario.
    router.replace('/auth/continuar');
    router.refresh();
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <FormError message={form.formState.errors.root?.server?.message} />
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
          {messages.auth.resetSubmit}
        </Button>
      </form>
    </Form>
  );
}
