// Condición de un paso (flujo-sof-aprobaciones.md §2). El MVP evalúa solo `min_amount` (texto
// decimal, p. ej. "5000.00"): el paso aplica si el total del documento lo alcanza. Una condición
// desconocida o inválida hace que el paso SÍ aplique (falla segura).
import Decimal from 'decimal.js';
import { z } from 'zod';

import type { StepConditionData } from './policy';

const MIN_AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** Las claves que no conoce el MVP (p. ej. `cost_center_ids`) se conservan al guardar. */
export const stepConditionSchema = z.looseObject({
  min_amount: z.string().regex(MIN_AMOUNT).optional(),
});

/** El monto mínimo de la condición, o null si no tiene o la condición no es válida. */
export function parseStepCondition(raw: unknown): { readonly minAmount: string | null } {
  const parsed = stepConditionSchema.safeParse(raw);
  return { minAmount: parsed.success ? (parsed.data.min_amount ?? null) : null };
}

/** ¿El paso aplica a un documento con este total? (`null` cuenta como 0). */
export function stepApplies(condition: StepConditionData, total: string | null): boolean {
  const { minAmount } = parseStepCondition(condition);
  if (minAmount === null) return true;
  return new Decimal(total ?? '0').greaterThanOrEqualTo(minAmount);
}
