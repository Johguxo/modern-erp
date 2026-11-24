import { z } from 'zod';

/** El login solo exige que los campos no estén vacíos (la política vive en /restablecer). */
export const inputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export const outputSchema = z.object({});
