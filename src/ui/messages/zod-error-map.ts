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
      if (issue.origin === 'array' || issue.origin === 'set') {
        return Number(issue.minimum) <= 1 ? v.atLeastOneItem : v.minItems(issue.minimum);
      }
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
        return issue.inclusive === false ? v.greaterThan(issue.minimum) : v.tooSmall(issue.minimum);
      }
      return v.invalid;
    case 'too_big':
      if (issue.origin === 'string') return v.tooLong(issue.maximum);
      if (issue.origin === 'array' || issue.origin === 'set') return v.maxItems(issue.maximum);
      if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint') {
        return issue.inclusive === false ? v.lessThan(issue.maximum) : v.tooBig(issue.maximum);
      }
      return v.invalid;
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
