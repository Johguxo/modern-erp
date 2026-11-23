// E0-H3 · Issues de Zod → errores por campo con rutas con punto (React Hook Form).
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { issuesToFieldErrors, ROOT_FIELD } from './validation';

function issuesOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Se esperaba un error de validación');
  return result.error.issues;
}

describe('issuesToFieldErrors', () => {
  it('usa rutas con punto, incluidos índices de arrays (lines.0.quantity)', () => {
    const schema = z.object({
      lines: z.array(z.object({ quantity: z.number().min(1, 'cantidad') })),
    });

    const fieldErrors = issuesToFieldErrors(issuesOf(schema, { lines: [{ quantity: 0 }] }));

    expect(fieldErrors).toEqual({ 'lines.0.quantity': ['cantidad'] });
  });

  it('agrupa varios mensajes del mismo campo', () => {
    const code = z.string().min(5, 'corto').regex(/^\d+$/, 'solo dígitos');

    const fieldErrors = issuesToFieldErrors(issuesOf(z.object({ code }), { code: 'ab' }));

    expect(fieldErrors).toEqual({ code: ['corto', 'solo dígitos'] });
  });

  it('un error sin ruta va a root', () => {
    const schema = z
      .object({ a: z.number(), b: z.number() })
      .refine((v) => v.a < v.b, { message: 'a debe ser menor que b' });

    const fieldErrors = issuesToFieldErrors(issuesOf(schema, { a: 2, b: 1 }));

    expect(ROOT_FIELD).toBe('root');
    expect(fieldErrors).toEqual({ root: ['a debe ser menor que b'] });
  });

  it('sin issues devuelve un objeto vacío', () => {
    expect(issuesToFieldErrors([])).toEqual({});
  });
});
