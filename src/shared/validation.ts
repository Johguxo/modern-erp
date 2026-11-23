// Convierte los issues de Zod en errores por campo con rutas con punto (`lines.0.quantity`).
import type { z } from 'zod';

import type { FieldErrors } from './errors';

/** Clave para errores que no son de un campo concreto (React Hook Form: `root`). */
export const ROOT_FIELD = 'root';

export function issuesToFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const result: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : ROOT_FIELD;
    (result[path] ??= []).push(issue.message);
  }
  return result;
}
