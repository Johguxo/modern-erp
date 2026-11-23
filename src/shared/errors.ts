// Errores de dominio (CLAUDE.md regla 8). `message` es interno (en inglés, para logs): el texto
// que ve el usuario sale de src/ui/messages/es-PE.ts según `code` y `reason`.

export const ERROR_CODES = [
  'NOT_FOUND',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'VALIDATION',
  'CONFLICT',
  'INVALID_TRANSITION',
  'LIMIT_EXCEEDED',
  'BAD_REQUEST',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Código HTTP por código de error (route handlers de api/v1). */
export const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  LIMIT_EXCEEDED: 403,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export interface DomainErrorOptions {
  /** Clave del mensaje específico en es-PE (messages.errors.reasons). */
  readonly reason?: string;
  /** Valores para el mensaje (por ejemplo, { max: 10 }). */
  readonly params?: Readonly<Record<string, string | number>>;
  /** Detalle interno, solo para logs. */
  readonly message?: string;
  readonly cause?: unknown;
}

// Marca en vez de instanceof: con recarga en caliente o bundles duplicados instanceof falla.
const DOMAIN_ERROR = Symbol.for('linkus.DomainError');

export abstract class DomainError extends Error {
  abstract readonly code: Exclude<ErrorCode, 'BAD_REQUEST' | 'INTERNAL'>;
  readonly reason: string | undefined;
  readonly params: Readonly<Record<string, string | number>>;
  readonly [DOMAIN_ERROR] = true;

  constructor(options: DomainErrorOptions = {}) {
    super(options.message ?? new.target.name, { cause: options.cause });
    this.name = new.target.name;
    this.reason = options.reason;
    this.params = options.params ?? {};
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED' as const;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION' as const;
  readonly fieldErrors: FieldErrors;

  constructor(options: DomainErrorOptions & { fieldErrors?: FieldErrors } = {}) {
    super(options);
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION' as const;
  readonly from: string;
  readonly event: string;

  constructor(options: DomainErrorOptions & { from: string; event: string }) {
    super({
      ...options,
      message: options.message ?? `Invalid transition: ${options.event} from ${options.from}`,
    });
    this.from = options.from;
    this.event = options.event;
  }
}

export class LimitExceededError extends DomainError {
  readonly code = 'LIMIT_EXCEEDED' as const;
}

export function isDomainError(error: unknown): error is DomainError {
  return typeof error === 'object' && error !== null && DOMAIN_ERROR in error;
}

/** Código HTTP de cualquier error: 500 si no es de dominio. */
export function httpStatusOf(error: unknown): number {
  return isDomainError(error) ? HTTP_STATUS_BY_CODE[error.code] : HTTP_STATUS_BY_CODE.INTERNAL;
}
