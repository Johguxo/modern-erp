'use client';

// Nombre visible, color principal y moneda (E1-H5). En solo lectura el formulario queda
// deshabilitado (el servidor igual bloquea la acción).
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { CompanySettingsView } from '@/modules/identity';
import { CURRENCIES, updateCompanySettingsContract } from '@/modules/identity/contracts';
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

import { updateCompanySettingsAction } from './actions';

const t = messages.company;
const HEX = /^#[0-9A-Fa-f]{6}$/;
/** Muestra del selector cuando no hay color propio (el acento de LinkUs). */
const DEFAULT_SWATCH = '#38BDF8';

export function CompanyForm({
  settings,
  readOnly,
}: {
  settings: CompanySettingsView;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const form = useZodForm(updateCompanySettingsContract.inputSchema, {
    displayName: settings.customDisplayName ?? '',
    primaryColor: settings.primaryColor ?? '',
    currency: settings.currency,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(undefined);
    const result = await updateCompanySettingsAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    setNotice(result.data.changed ? t.notices.saved : t.notices.unchanged);
    router.refresh();
  });

  return (
    <section
      aria-labelledby="company-details-title"
      className="rounded-xl border border-border bg-surface p-4 md:p-6"
    >
      <h2 id="company-details-title" className="mb-4 text-lg font-semibold">
        {t.detailsTitle}
      </h2>
      <Form {...form}>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
          {notice ? (
            <p
              role="status"
              className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
            >
              {notice}
            </p>
          ) : null}
          <FormError message={form.formState.errors.root?.server?.message} />
          <fieldset disabled={readOnly} className="flex flex-col gap-5">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.displayName}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="organization"
                      placeholder={settings.legalName}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>{t.displayNameHint(settings.legalName)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="primaryColor"
              render={({ field }) => {
                const text = typeof field.value === 'string' ? field.value : '';
                return (
                  <FormItem>
                    <FormLabel>{t.primaryColor}</FormLabel>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        aria-label={t.pickColor}
                        className="size-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
                        value={HEX.test(text) ? text.toLowerCase() : DEFAULT_SWATCH.toLowerCase()}
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                      <FormControl>
                        <Input
                          placeholder="#38BDF8"
                          spellCheck={false}
                          autoComplete="off"
                          maxLength={7}
                          name={field.name}
                          onBlur={field.onBlur}
                          value={text}
                          onChange={(event) => field.onChange(event.target.value)}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>{t.primaryColorHint}</FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.currency}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {messages.admin.form.currencies[currency]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t.currencyHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Button type="submit" disabled={readOnly || form.formState.isSubmitting}>
                {t.save}
              </Button>
            </div>
          </fieldset>
        </form>
      </Form>
    </section>
  );
}
