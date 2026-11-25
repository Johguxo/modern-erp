'use client';

// Crear o editar un equipo. El código solo se escribe al crear.
import { useState, type ReactNode } from 'react';

import type { EquipmentView } from '@/modules/catalog';
import { CODE_MAX, upsertEquipmentContract } from '@/modules/catalog/contracts';
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

import { upsertEquipmentAction } from '../_catalog/actions';
import type { Notice } from '@/ui/base/notice-banner';

const t = messages.catalog;
const f = t.fields;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function defaultsOf(item: EquipmentView | undefined) {
  return {
    id: item?.id,
    code: item?.code ?? '',
    name: item?.name ?? '',
    type: item?.type ?? '',
  };
}

export function EquipmentDialog({
  item,
  trigger,
  onDone,
}: {
  /** Con equipo se edita (código de solo lectura); sin equipo se crea. */
  item?: EquipmentView;
  trigger: ReactNode;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const editing = item !== undefined;
  const form = useZodForm(upsertEquipmentContract.inputSchema, defaultsOf(item));

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await upsertEquipmentAction(values);
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
            {item ? t.equipment.editTitle(item.code) : t.equipment.createTitle}
          </DialogTitle>
          <DialogDescription>{t.equipment.description}</DialogDescription>
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
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.type}</FormLabel>
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
