'use client';

// Formulario de numeración del SOF (E3-H1), compartido por el detalle del cliente (consola) y
// /configuracion/empresa. Quien lo usa aporta `onSave` (la server action con su contexto); en solo
// lectura queda deshabilitado (el servidor igual bloquea la acción).
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { sequenceSetupFieldsSchema } from '@/modules/requests/contracts';
import type { SequenceView } from '@/modules/requests';
import { Button } from '@/ui/components/button';
import { Form } from '@/ui/components/form';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';
import type { ActionResult } from '@/shared/result';

import { DocumentSequenceFields } from './document-sequence-fields';

const t = messages.sequence;

export type SaveSequence = (values: {
  sequencePrefix: string;
  sequenceNextNumber: number;
}) => Promise<ActionResult<{ sequence: SequenceView; changed: boolean }>>;

export function DocumentSequenceForm({
  sequence,
  readOnly = false,
  onSave,
}: {
  sequence: SequenceView;
  readOnly?: boolean;
  onSave: SaveSequence;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string>();
  const form = useZodForm(sequenceSetupFieldsSchema, {
    sequencePrefix: sequence.prefix,
    sequenceNextNumber: String(sequence.nextNumber),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(undefined);
    const result = await onSave(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    form.reset({
      sequencePrefix: result.data.sequence.prefix,
      sequenceNextNumber: String(result.data.sequence.nextNumber),
    });
    setNotice(result.data.changed ? t.notices.saved : t.notices.unchanged);
    router.refresh();
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        {notice ? (
          <p
            role="status"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          >
            {notice}
          </p>
        ) : null}
        <FormError message={form.formState.errors.root?.server?.message} />
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          <DocumentSequenceFields
            lastIssuedNumber={sequence.lastIssuedNumber}
            padding={sequence.padding}
          />
          <div>
            <Button type="submit" disabled={readOnly || form.formState.isSubmitting}>
              {t.save}
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
