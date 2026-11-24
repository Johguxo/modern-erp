import { z } from 'zod';

/** Política de contraseña (ADR-006): 10 a 72 caracteres (72 = límite de bcrypt). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const inputSchema = z.object({
  tokenHash: z.string().min(1),
  password: passwordSchema,
});

export const outputSchema = z.object({});
