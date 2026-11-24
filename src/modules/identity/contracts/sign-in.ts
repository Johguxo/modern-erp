import { z } from 'zod';

/** El login solo exige que los campos no estén vacíos (la política vive en /restablecer); min(1)
 * antes del formato para que el correo vacío diga "Este campo es obligatorio.". */
export const inputSchema = z.object({
  email: z.string().trim().min(1).toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export const outputSchema = z.object({});
