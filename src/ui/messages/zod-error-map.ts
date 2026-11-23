// Mensajes de validación de Zod en es-PE, configurados una vez para todo el proceso (servidor y
// cliente). Los contratos de los módulos no llevan textos propios.
import { z } from 'zod';

import { messages } from './es-PE';

const v = messages.validation;

export const esPeErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null || issue.input === ''
        ? v.required
        : v.invalid;
    case 'too_small':
      if (issue.origin === 'string') {
        return issue.minimum === 1 ? v.required : v.tooShort(issue.minimum);
      }
      return v.tooSmall(issue.minimum);
    case 'too_big':
      return issue.origin === 'string' ? v.tooLong(issue.maximum) : v.tooBig(issue.maximum);
    case 'invalid_format':
      return v.invalidFormat;
    default:
      return v.invalid;
  }
};

let configured = false;

/** Activa los mensajes en es-PE. Idempotente; se llama al cargar action/route y en el cliente. */
export function configureZodMessages(): void {
  if (configured) return;
  z.config({ customError: esPeErrorMap });
  configured = true;
}
