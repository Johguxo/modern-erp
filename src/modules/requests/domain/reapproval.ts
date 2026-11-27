// Regla de reaprobación de una corrección de línea (flujo §4). Pura, con decimal.js: nunca number.
import Decimal from 'decimal.js';

const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const REAPPROVAL_BRANCHES = [
  'amount_unchanged',
  'within_tolerance',
  'above_tolerance',
] as const;
/**
 * - `amount_unchanged`: el total no cambia; las firmas se mantienen.
 * - `within_tolerance`: el total cambia pero no sube más que la tolerancia; las firmas se mantienen.
 * - `above_tolerance`: el total sube por encima de la tolerancia; hace falta reconfirmar la línea.
 */
export type ReapprovalBranch = (typeof REAPPROVAL_BRANCHES)[number];

export interface ReapprovalInput {
  /** Total antes de la corrección (texto decimal). */
  readonly previousTotal: string;
  /** Total después de la corrección (texto decimal). */
  readonly newTotal: string;
  /** `reapproval_tolerance_pct` de la política: texto decimal entre «0» y «100». */
  readonly tolerancePct: string;
}

/**
 * La base de la tolerancia es el total anterior: sube «más» que la tolerancia cuando
 * `nuevo − anterior > anterior × pct / 100`. Bajar el total nunca pide reconfirmación; un total
 * anterior de 0 no admite ninguna subida.
 */
export function reapprovalBranch(input: ReapprovalInput): ReapprovalBranch {
  const previous = new Dec(input.previousTotal);
  const next = new Dec(input.newTotal);
  if (next.eq(previous)) return 'amount_unchanged';
  const increase = next.minus(previous);
  const allowed = previous.mul(new Dec(input.tolerancePct)).div(100);
  return increase.gt(allowed) ? 'above_tolerance' : 'within_tolerance';
}
