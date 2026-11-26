// Reemplaza todos los pasos de la política vigente (bloqueo optimista con `version`).
import { z } from 'zod';

import { DOC_TYPES } from '../domain/route-preview';

import { policyViewSchema, stepsSchema } from './policy-view';

export const inputSchema = z.object({
  docType: z.enum(DOC_TYPES),
  /** La versión que la pantalla vio al abrir la política. */
  version: z.number().int().min(1),
  steps: stepsSchema,
});

export const outputSchema = policyViewSchema;
