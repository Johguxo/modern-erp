'use client';

// Formulario de alta de cliente (E1-H4). El slug se propone desde el nombre hasta que el usuario
// lo edita. Al crear, va al detalle del cliente con el aviso del correo.
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import type { PlanOption } from '@/modules/identity';
import {
  CURRENCIES,
  platformCreateTenantContract,
  slugFromName,
} from '@/modules/identity/contracts';
import { Button } from '@/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';

import { createTenantAction } from '../actions';
import { MaxUsersInput } from '../max-users-input';

const f = messages.admin.form;

export function NewTenantForm({ plans }: { plans: readonly PlanOption[] }) {
  const router = useRouter();
  const slugEdited = useRef(false);
  const form = useZodForm(platformCreateTenantContract.inputSchema, {
    name: '',
    slug: '',
    planCode: plans[0]?.code ?? '',
    maxUsers: '',
    currency: 'PEN',
    adminEmail: '',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createTenantAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    const notice = result.data.emailSent ? 'created' : 'createdEmailFailed';
    router.push(`/admin/clientes/${result.data.tenantId}?aviso=${notice}` as Route);
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex max-w-xl flex-col gap-5 rounded-xl border border-border bg-surface p-4 md:p-6"
        noValidate
      >
        <FormError message={form.formState.errors.root?.server?.message} />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.name}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="organization"
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    if (!slugEdited.current) {
                      form.setValue('slug', slugFromName(event.target.value));
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.slug}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  {...field}
                  onChange={(event) => {
                    slugEdited.current = true;
                    field.onChange(event);
                  }}
                />
              </FormControl>
              <FormDescription>{f.slugHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="planCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.plan}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.select} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.code} value={plan.code}>
                      {f.planOption(plan.name, plan.maxUsers)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxUsers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.maxUsers}</FormLabel>
              <FormControl>
                <MaxUsersInput {...field} />
              </FormControl>
              <FormDescription>{f.maxUsersHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.currency}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.select} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {f.currencies[currency]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="adminEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.adminEmail}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>{f.adminEmailHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {f.create}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/admin/clientes')}>
            {messages.users.cancel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
