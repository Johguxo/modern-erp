import { z } from 'zod';

import { PASSWORD_MAX, passwordSchema } from './reset-password';

/** Token del enlace: 32 bytes en base64url (43 caracteres). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Cuenta nueva: nombre y contraseña con la política de ADR-006 (10 a 72). */
export const newAccountFormSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});

/** Cuenta existente sin sesión: su contraseña actual (el correo es el de la invitación). */
export const passwordFormSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX),
});

/** El modo lo decide el servidor (vista previa); si cambió entre tanto, la acción da CONFLICT. */
export const inputSchema = z.discriminatedUnion('mode', [
  z
    .object({ mode: z.literal('new_account'), token: tokenSchema })
    .extend(newAccountFormSchema.shape),
  z.object({ mode: z.literal('password'), token: tokenSchema }).extend(passwordFormSchema.shape),
  z.object({ mode: z.literal('session'), token: tokenSchema }),
]);

export const outputSchema = z.object({});
