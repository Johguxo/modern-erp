'use client';

// useForm con el resolver de Zod y los mensajes en es-PE activos en el navegador (ADR-005).
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import { configureZodMessages } from '@/ui/messages/zod-error-map';

configureZodMessages();

export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  defaultValues: DefaultValues<z.input<S>>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onSubmit',
  });
}
