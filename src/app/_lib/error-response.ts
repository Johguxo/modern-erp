// Traduce cualquier error a lo que ve el usuario: código + mensaje es-PE + requestId.
// Nunca expone Error.message ni detalles técnicos; los errores inesperados se registran completos.
import { unstable_rethrow } from 'next/navigation';

import { isDomainError, ValidationError, type ErrorCode } from '@/shared/errors';
import type { Logger } from '@/shared/ports/logger';
import type { ActionError } from '@/shared/result';
import { messages } from '@/ui/messages/es-PE';

type Reasons = typeof messages.errors.reasons;

function messageFor(
  code: ErrorCode,
  reason?: string,
  params: Record<string, string | number> = {},
) {
  if (reason && Object.hasOwn(messages.errors.reasons, reason)) {
    return messages.errors.reasons[reason as keyof Reasons](params);
  }
  return messages.errors.codes[code];
}

export function toActionError(error: unknown, requestId: string, logger: Logger): ActionError {
  // redirect() y notFound() de Next se lanzan como errores: hay que dejarlos pasar.
  unstable_rethrow(error);

  if (isDomainError(error)) {
    logger.info({ code: error.code, reason: error.reason, err: error }, 'domain error');
    return {
      code: error.code,
      message: messageFor(error.code, error.reason, error.params),
      fieldErrors: error instanceof ValidationError ? error.fieldErrors : undefined,
      requestId,
    };
  }

  logger.error({ err: error }, 'unexpected error');
  return { code: 'INTERNAL', message: messages.errors.codes.INTERNAL, requestId };
}

export function errorOf(code: ErrorCode, requestId: string): ActionError {
  return { code, message: messages.errors.codes[code], requestId };
}
