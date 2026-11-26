// Política de aprobación vigente de un tipo de documento, con lo necesario para configurarla.
import { z } from 'zod';

import { DOC_TYPES } from '../domain/route-preview';

import { policyViewSchema } from './policy-view';

export const inputSchema = z.object({ docType: z.enum(DOC_TYPES) });

export const outputSchema = policyViewSchema;
