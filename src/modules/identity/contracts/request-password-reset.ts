import { z } from 'zod';

export const inputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

/** Siempre vacío: la respuesta no revela si el correo existe. */
export const outputSchema = z.object({});
