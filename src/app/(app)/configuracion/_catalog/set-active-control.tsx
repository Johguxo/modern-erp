'use client';

// Activar / desactivar un registro del catálogo. Activar es un clic; desactivar pide confirmación.
import { useState, useTransition } from 'react';

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
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import type { Notice } from './catalog-list-view';

const t = messages.catalog;

type SetActiveResult = { ok: true } | { ok: false; error: { message: string } };

export function SetActiveControl({
  name,
  active,
  disabled,
  setActive,
  onDone,
}: {
  /** Nombre del registro, para el título de la confirmación. */
  name: string;
  active: boolean;
  disabled: boolean;
  setActive: (active: boolean) => Promise<SetActiveResult>;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (next: boolean, fail: (message: string) => void, close?: () => void) =>
    startTransition(async () => {
      const result = await setActive(next);
      if (!result.ok) {
        fail(result.error.message);
        return;
      }
      close?.();
      onDone({ tone: 'success', text: next ? t.notices.activated : t.notices.deactivated });
    });

  if (!active) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={() => run(true, (message) => onDone({ tone: 'warning', text: message }))}
      >
        {t.actions.activate}
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setError(undefined);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          {t.actions.deactivate}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.deactivateTitle(name)}</DialogTitle>
          <DialogDescription>{t.deactivateDescription}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.actions.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => run(false, setError, () => setOpen(false))}
          >
            {t.deactivateConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
