'use client';

// Crear o editar un centro de costo. El código solo se escribe al crear.
import { useState, type ReactNode } from 'react';

import type { CostCenterView } from '@/modules/catalog';
import { CODE_MAX, upsertCostCenterContract } from '@/modules/catalog/contracts';
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
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';

import { upsertCostCenterAction } from '../_catalog/actions';
import type { Notice } from '../_catalog/catalog-list-view';

const t = messages.catalog;
const f = t.fields;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function defaultsOf(item: CostCenterView | undefined) {
  return {
    id: item?.id,
    code: item?.code ?? '',
    name: item?.name ?? '',
  };
}

export function CostCenterDialog({
  item,
  trigger,
  onDone,
}: {
  /** Con centro de costo se edita (código de solo lectura); sin él se crea. */
  item?: CostCenterView;
  trigger: ReactNode;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const editing = item !== undefined;
  const form = useZodForm(upsertCostCenterContract.inputSchema, defaultsOf(item));

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await upsertCostCenterAction(values);
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
            {item ? t.costCenters.editTitle(item.code) : t.costCenters.createTitle}
          </DialogTitle>
          <DialogDescription>{t.costCenters.description}</DialogDescription>
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
