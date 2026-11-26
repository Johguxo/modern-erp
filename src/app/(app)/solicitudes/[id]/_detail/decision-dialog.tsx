'use client';

// Diálogo de decisión del aprobador (E4-H2): Aprobar (comentario opcional), Pedir cambios y Rechazar
// (comentario obligatorio). Al decidir, la página se recarga con ?decision=<resultado> para mostrar
// el aviso. Si alguien decidió o cambió el documento antes (conflicto o paso ya decidido), el
// diálogo ofrece «Recargar» en vez de reintentar a ciegas. `trigger` permite reusarlo en la barra
// móvil con otro botón.
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

import { DECISION_COMMENT_MAX, type DecisionKind } from '@/modules/requests/contracts';
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

import { decideRequestAction } from '../../actions';

const t = messages.requests.detail.decision;

/** Aprobar no exige comentario; rechazar y pedir cambios, sí. */
export function commentRequired(decision: DecisionKind): boolean {
  return decision !== 'approve';
}

function commentSchema(decision: DecisionKind) {
  const base = z.string().trim();
  return z.object({
    comment: commentRequired(decision)
      ? base.min(1).max(DECISION_COMMENT_MAX)
      : base.max(DECISION_COMMENT_MAX),
  });
}

/** Errores tras los cuales el usuario debe recargar para ver el estado actual. */
export function needsReload(error: { code: string; reason?: string | undefined }): boolean {
  return (
    error.code === 'CONFLICT' ||
    error.code === 'INVALID_TRANSITION' ||
    error.reason === 'step_already_decided' ||
    error.reason === 'not_an_approver' ||
    error.reason === 'approval_not_started'
  );
}

export function DecisionDialog({
  decision,
  requestId,
  version,
  stepId,
  number,
  trigger,
}: {
  decision: DecisionKind;
  requestId: string;
  /** Versión del documento que vio la página: la decisión falla si cambió. */
  version: number;
  /** El paso pendiente del usuario que vio la página. */
  stepId: string;
  number: string | null;
  /** El botón que abre el diálogo (el `DialogTrigger` lo pone este componente). */
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(false);
  const schema = useMemo(() => commentSchema(decision), [decision]);
  const form = useZodForm(schema, { comment: '' });
  const copy = t[decision];
  const used = form.watch('comment').trim().length;
  const left = DECISION_COMMENT_MAX - used;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await decideRequestAction({
      id: requestId,
      version,
      stepId,
      decision,
      comment: values.comment === '' ? null : values.comment,
    });
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      setReload(needsReload(result.error));
      return;
    }
    setOpen(false);
    router.replace(`/solicitudes/${requestId}?decision=${result.data.outcome}`);
    router.refresh();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          form.reset({ comment: '' });
          setReload(false);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title(number)}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
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
                  <FormLabel>{copy.commentLabel}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      autoComplete="off"
                      placeholder={copy.commentPlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription
                    className={cn('text-[13px]', used > DECISION_COMMENT_MAX && 'text-danger')}
                  >
                    {t.counter(used, DECISION_COMMENT_MAX)}
                  </FormDescription>
                  <p aria-live="polite" className="sr-only">
                    {left <= 50 ? t.remaining(left) : ''}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Orden en el DOM = orden de tabulación y de lectura: acción, Volver, Recargar. Desde
                sm se invierte la fila para dejar la acción a la derecha. */}
            <DialogFooter className="flex-col sm:flex-row-reverse sm:justify-start">
              <Button
                type="submit"
                variant={decision === 'reject' ? 'destructive' : 'default'}
                className={cn(
                  decision === 'approve' && 'bg-success text-white hover:bg-success/90',
                )}
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? copy.submitting : copy.submit}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.back}
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
                  {t.reload}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
