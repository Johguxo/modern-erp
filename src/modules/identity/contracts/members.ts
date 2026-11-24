// Piezas comunes de los contratos de gestión de usuarios (E1-H3), seguras para el cliente.
import { z } from 'zod';

import type { Role } from '@/shared/permissions';

/** Roles que se pueden asignar en el MVP (`purchasing` es de la fase 2; ADR-002). */
export const ASSIGNABLE_ROLES = [
  'admin',
  'requester',
  'warehouse',
  'approver',
] as const satisfies readonly Role[];

/** Al menos un rol, sin repetidos. */
export const rolesSchema = z
  .array(z.enum(ASSIGNABLE_ROLES))
  .min(1)
  .max(ASSIGNABLE_ROLES.length)
  .transform((roles) => [...new Set(roles)]);

export const emailSchema = z.string().trim().min(1).toLowerCase().pipe(z.email().max(254));
