// Vista previa de la ruta de aprobación de un tipo de documento.
import { z } from 'zod';

import { TENANT_ROLES } from '@/shared/permissions';

import { DOC_TYPES, STEP_RULES } from '../domain/route-preview';

export const inputSchema = z.object({ docType: z.enum(DOC_TYPES) });

export const outputSchema = z.object({
  docType: z.enum(DOC_TYPES),
  policyName: z.string(),
  steps: z.array(
    z.object({
      order: z.number().int().min(1),
      name: z.string(),
      role: z.enum(TENANT_ROLES),
      rule: z.enum(STEP_RULES),
    }),
  ),
});
