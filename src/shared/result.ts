// Resultado uniforme de server actions y cuerpo de respuesta de api/v1.
import type { ErrorCode, FieldErrors } from './errors';

export interface ActionError {
  readonly code: ErrorCode;
  /** Texto en es-PE para el usuario; nunca un detalle técnico. */
  readonly message: string;
  /** Errores por campo con rutas con punto (`lines.0.quantity`), como React Hook Form. */
  readonly fieldErrors?: FieldErrors;
  /** Se muestra como "Código de referencia" para soporte. */
  readonly requestId: string;
}

export type ActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ActionError };

export interface ApiSuccessBody<T> {
  readonly data: T;
}

export interface ApiErrorBody {
  readonly error: ActionError;
}
