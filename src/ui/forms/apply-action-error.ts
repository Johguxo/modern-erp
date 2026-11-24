// Lleva un ActionError a React Hook Form: cada fieldError a su campo (rutas con punto) y el
// mensaje general a `root.server` (ADR-005).
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import type { ActionError } from '@/shared/result';
import { ROOT_FIELD } from '@/shared/validation';

export function applyActionError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: ActionError,
): void {
  for (const [path, fieldMessages] of Object.entries(error.fieldErrors ?? {})) {
    if (path === ROOT_FIELD) continue;
    const [first] = fieldMessages;
    if (first) setError(path as Path<T>, { type: 'server', message: first });
  }
  setError('root.server', { type: 'server', message: error.message });
}
