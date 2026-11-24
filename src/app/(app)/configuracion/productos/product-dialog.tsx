'use client';

// Crear o editar un producto. El código solo se escribe al crear. Precio y moneda van juntos:
// la moneda se habilita al escribir un precio (propone la del producto o la de la empresa) y se
// vacía al borrar el precio.
import { useState, type ReactNode } from 'react';

import type { ProductView } from '@/modules/catalog';
import { CODE_MAX, CURRENCIES, upsertProductContract } from '@/modules/catalog/contracts';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
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
import { trimDecimal, type CurrencyCode } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

import { upsertProductAction } from '../_catalog/actions';
import type { Notice } from '../_catalog/catalog-list-view';

const t = messages.catalog;
const f = t.fields;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function defaultsOf(item: ProductView | undefined) {
  return {
    id: item?.id,
    code: item?.code ?? '',
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    category: item?.category ?? '',
    referencePrice: item?.referencePrice ? trimDecimal(item.referencePrice) : '',
    currency: item?.currency ?? '',
  };
}

export function ProductDialog({
  item,
  trigger,
  tenantCurrency,
  onDone,
}: {
  /** Con producto se edita (código de solo lectura); sin producto se crea. */
  item?: ProductView;
  trigger: ReactNode;
  /** Moneda que se propone al escribir un precio en un producto sin moneda. */
  tenantCurrency: CurrencyCode;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const editing = item !== undefined;
  const form = useZodForm(upsertProductContract.inputSchema, defaultsOf(item));
  const hasPrice = text(form.watch('referencePrice')).trim() !== '';

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await upsertProductAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    setOpen(false);
    const { created, changed } = result.data;
    onDone({
      tone: 'success',
      text: created ? t.notices.created : changed ? t.notices.updated : t.notices.unchanged,
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaultsOf(item));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? t.products.editTitle(item.code) : t.products.createTitle}
          </DialogTitle>
          <DialogDescription>{t.products.description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormError message={form.formState.errors.root?.server?.message} />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.code}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={CODE_MAX}
                      readOnly={editing}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={text(field.value)}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>{editing ? t.codeReadOnlyHint : t.codeHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.name}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.unit}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder={f.unitPlaceholder} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.category}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        name={field.name}
                        onBlur={field.onBlur}
                        value={text(field.value)}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="referencePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.price}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        name={field.name}
                        onBlur={field.onBlur}
                        value={text(field.value)}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value);
                          if (value.trim() === '') {
                            form.setValue('currency', '');
                          } else if (text(form.getValues('currency')) === '') {
                            form.setValue('currency', item?.currency ?? tenantCurrency);
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>{f.priceHint}</FormDescription>
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
                    <Select
                      value={text(field.value)}
                      onValueChange={field.onChange}
                      disabled={!hasPrice}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={f.currencyPlaceholder} />
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.actions.cancel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t.actions.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
