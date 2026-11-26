// Forma de la política que ve la pantalla de configuración (E4-H1): la salida de getPolicy y de
// updatePolicySteps.
import { z } from 'zod';

import { TENANT_ROLES } from '@/shared/permissions';

import { MAX_POLICY_STEPS, MAX_STEP_NAME_LENGTH, MAX_USERS_PER_STEP } from '../domain/policy';
import { DOC_TYPES, STEP_RULES } from '../domain/route-preview';
import { stepConditionSchema } from '../domain/step-condition';

export const stepSchema = z.object({
  name: z.string().trim().min(1).max(MAX_STEP_NAME_LENGTH),
  approverType: z.enum(['role', 'users']),
  role: z.enum(TENANT_ROLES).nullable(),
  userIds: z
    .array(z.uuid())
    .max(MAX_USERS_PER_STEP)
    // El mensaje es una reason de messages.errors.reasons (es-PE).
    .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicated_approver' }),
  rule: z.enum(STEP_RULES),
  /** La pantalla no la edita, pero la conserva al guardar y al mover el paso. */
  condition: stepConditionSchema,
});

export const stepsSchema = z.array(stepSchema).max(MAX_POLICY_STEPS);

const warningSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('role_without_members') }),
  z.object({ type: z.literal('inactive_users'), userIds: z.array(z.string()) }),
]);

export const policyViewSchema = z.object({
  docType: z.enum(DOC_TYPES),
  name: z.string(),
  /** Bloqueo optimista: se devuelve al guardar. */
  version: z.number().int().min(1),
  hasReservedSteps: z.boolean(),
  steps: z.array(stepSchema.extend({ warnings: z.array(warningSchema) })),
  /** Miembros activos que se pueden elegir como aprobadores. */
  members: z.array(
    z.object({ userId: z.string(), name: z.string(), roles: z.array(z.enum(TENANT_ROLES)) }),
  ),
  /** Usuarios de los pasos que ya no son miembros activos (se muestran como «desactivado»). */
  inactiveUsers: z.array(z.object({ userId: z.string(), name: z.string() })),
});
