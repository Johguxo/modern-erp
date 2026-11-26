// Traduce cualquier error a lo que ve el usuario: código + mensaje es-PE + requestId.
// Nunca expone Error.message ni detalles técnicos; los errores inesperados se registran completos.
import { unstable_rethrow } from 'next/navigation';

import { isDomainError, type ErrorCode, type FieldErrors } from '@/shared/errors';
import type { Logger } from '@/shared/ports/logger';
import type { ActionError } from '@/shared/result';
import { messages } from '@/ui/messages/es-PE';

type Reasons = typeof messages.errors.reasons;

/** Motivos que la UI necesita para decidir qué ofrecer (p. ej. «Recargar»); el resto no sale. */
const CLIENT_REASONS: ReadonlySet<string> = new Set(['cancel_not_allowed']);

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

/** Un mensaje de campo que es una reason conocida (p. ej. same_password) se muestra en es-PE. */
function translateFieldErrors(fieldErrors: FieldErrors, params: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([path, list]) => [
      path,
      list.map((m) =>
        Object.hasOwn(messages.errors.reasons, m)
          ? messages.errors.reasons[m as keyof Reasons](params)
          : m,
      ),
    ]),
  );
}

export function toActionError(error: unknown, requestId: string, logger: Logger): ActionError {
  // redirect() y notFound() de Next se lanzan como errores: hay que dejarlos pasar.
  unstable_rethrow(error);

  if (isDomainError(error)) {
    logger.info({ code: error.code, reason: error.reason, err: error }, 'domain error');
    return {
      code: error.code,
      message: messageFor(error.code, error.reason, error.params),
      ...(error.reason && CLIENT_REASONS.has(error.reason) ? { reason: error.reason } : {}),
      // Por código y no por instanceof (misma razón que la marca de DomainError).
      fieldErrors:
        error.code === 'VALIDATION' && 'fieldErrors' in error
          ? translateFieldErrors(error.fieldErrors as FieldErrors, error.params)
          : undefined,
      requestId,
    };
  }

  logger.error({ err: error }, 'unexpected error');
  return { code: 'INTERNAL', message: messages.errors.codes.INTERNAL, requestId };
}

export function errorOf(code: ErrorCode, requestId: string): ActionError {
  return { code, message: messages.errors.codes[code], requestId };
}
