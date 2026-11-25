'use client';

// Campos de la numeración del SOF (E3-H1): prefijo, siguiente número y vista previa del próximo
// número. Se usan dentro de un formulario con los campos `sequencePrefix` y `sequenceNextNumber`:
// el alta del cliente, el detalle del cliente en la consola y /configuracion/empresa.
import { useFormContext, useWatch } from 'react-hook-form';

import { formatDocumentNumber, normalizePrefix } from '@/modules/requests/contracts';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import { messages } from '@/ui/messages/es-PE';

const t = messages.sequence;

export interface SequenceFormValues {
  sequencePrefix: string;
  sequenceNextNumber: string | number;
}

/** Relleno del correlativo (4 dígitos, como SOF-0143). */
const DEFAULT_PADDING = 4;

/** Vista previa del próximo número, o null si lo escrito aún no es válido. */
export function sequencePreview(
  prefix: unknown,
  nextNumber: unknown,
  padding = DEFAULT_PADDING,
): string | null {
  if (typeof prefix !== 'string' || prefix.trim() === '') return null;
  const number = Number(nextNumber);
  if (nextNumber === '' || !Number.isInteger(number) || number < 1) return null;
  return formatDocumentNumber(normalizePrefix(prefix), number, padding);
}

export function DocumentSequenceFields({
  lastIssuedNumber = null,
  padding = DEFAULT_PADDING,
}: {
  /** Último número emitido (null si aún no se envió ningún SOF). */
  lastIssuedNumber?: number | null;
  padding?: number;
}) {
  const { control } = useFormContext<SequenceFormValues>();
  const [prefix, nextNumber] = useWatch({
    control,
    name: ['sequencePrefix', 'sequenceNextNumber'],
  });
  const preview = sequencePreview(prefix, nextNumber, padding);

  return (
    <>
      <FormField
        control={control}
        name="sequencePrefix"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t.prefix}</FormLabel>
            <FormControl>
              <Input
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                className="uppercase"
                {...field}
              />
            </FormControl>
            <FormDescription>{t.prefixHint}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="sequenceNextNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t.nextNumber}</FormLabel>
            <FormControl>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={field.disabled}
                value={
                  typeof field.value === 'string' || typeof field.value === 'number'
                    ? field.value
                    : ''
                }
                onChange={(event) => field.onChange(event.target.value)}
              />
            </FormControl>
            <FormDescription>{t.nextNumberHint(lastIssuedNumber)}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <p
        aria-live="polite"
        data-testid="sequence-preview"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
      >
        {preview ? t.preview(preview) : ' '}
      </p>
    </>
  );
}
