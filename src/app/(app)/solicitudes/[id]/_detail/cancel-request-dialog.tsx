'use client';

// Diálogo «Anular» del detalle del SOF (E3-H5): comentario obligatorio. Al anular, la página se
// recarga con ?anulado=1 para mostrar el aviso. Si alguien cambió el documento antes (conflicto o
// cambio de estado), el diálogo ofrece «Recargar» en vez de reintentar a ciegas.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CANCEL_COMMENT_MAX, cancelRequestContract } from '@/modules/requests/contracts';
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
import { Textarea } from '@/ui/components/textarea';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { cancelRequestAction } from '../../actions';

const t = messages.requests.detail;

export function CancelRequestDialog({
  requestId,
  version,
  number,
  large = false,
  className,
}: {
  requestId: string;
  /** Versión del documento que vio la página: la anulación falla si cambió. */
  version: number;
  number: string | null;
  large?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(false);
  const form = useZodForm(cancelRequestContract.inputSchema, {
    id: requestId,
    version,
    comment: '',
  });
  const used = form.watch('comment').trim().length;
  const left = CANCEL_COMMENT_MAX - used;

  const onSubmit = form.handleSubmit(async (values) => {
    // La versión viene de la página (puede haberse recargado desde que se abrió el formulario).
    const result = await cancelRequestAction({ ...values, id: requestId, version });
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      setReload(
        result.error.code === 'CONFLICT' ||
          result.error.code === 'INVALID_TRANSITION' ||
          (result.error.code === 'FORBIDDEN' && result.error.reason === 'cancel_not_allowed'),
      );
      return;
    }
    setOpen(false);
    router.replace(`/solicitudes/${requestId}?anulado=1`);
    router.refresh();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          form.reset({ id: requestId, version, comment: '' });
          setReload(false);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size={large ? 'lg' : 'default'} className={className}>
          {t.actions.cancel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.cancel.title(number)}</DialogTitle>
          <DialogDescription>{t.cancel.description}</DialogDescription>
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
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.cancel.commentLabel}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      autoComplete="off"
                      placeholder={t.cancel.commentPlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription
                    className={cn('text-[13px]', used > CANCEL_COMMENT_MAX && 'text-danger')}
                  >
                    {t.cancel.counter(used, CANCEL_COMMENT_MAX)}
                  </FormDescription>
                  {/* Aviso hablado aparte: solo cuando quedan pocos caracteres o se pasó. */}
                  <p aria-live="polite" className="sr-only">
                    {left <= 50 ? t.cancel.remaining(left) : ''}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Orden en el DOM = orden de tabulación y de lectura: Anular, Volver, Recargar. En el
                celular se apilan en ese orden; desde sm se invierte la fila para dejar Anular a la
                derecha. */}
            <DialogFooter className="flex-col sm:flex-row-reverse sm:justify-start">
              <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t.cancel.submitting : t.cancel.submit}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.cancel.back}
              </Button>
              {reload ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  {t.cancel.reload}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
