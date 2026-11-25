// Vista previa de la ruta de aprobación de un tipo de documento y un total.
import { z } from 'zod';

import { TENANT_ROLES } from '@/shared/permissions';

import { DOC_TYPES, STEP_RULES } from '../domain/route-preview';

/** Dinero como texto decimal (numeric(14,2)); null mientras no hay monto. */
const totalSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .nullable();

export const inputSchema = z.object({ docType: z.enum(DOC_TYPES), total: totalSchema });

const approverNames = z.array(z.object({ userId: z.string(), name: z.string() }));

const stepBase = {
  order: z.number().int().min(1),
  name: z.string(),
  rule: z.enum(STEP_RULES),
};

export const outputSchema = z.object({
  docType: z.enum(DOC_TYPES),
  policyName: z.string(),
  steps: z.array(
    z.discriminatedUnion('approverType', [
      z.object({
        ...stepBase,
        approverType: z.literal('role'),
        role: z.enum(TENANT_ROLES),
        approvers: approverNames,
      }),
      z.object({ ...stepBase, approverType: z.literal('users'), approvers: approverNames }),
    ]),
  ),
});
