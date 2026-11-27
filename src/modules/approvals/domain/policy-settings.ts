// Ajustes de la política de aprobación (`approval_policies.settings`, jsonb). Hoy solo uno:
// `reapproval_tolerance_pct` (E4-H4, flujo §4). Puro: sin base de datos.
import Decimal from 'decimal.js';

/** Tolerancia por defecto: cualquier subida del total pide reconfirmar. */
export const DEFAULT_REAPPROVAL_TOLERANCE_PCT = '0';

/** Texto decimal sin signo ni notación científica, hasta 4 decimales. */
const PCT_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;

export interface ReapprovalTolerance {
  /** Texto decimal entre «0» y «100». */
  readonly tolerancePct: string;
  /** `missing`: la política no lo define; `invalid`: tiene un valor que no sirve. */
  readonly fallback: 'missing' | 'invalid' | null;
}

/**
 * El porcentaje de tolerancia de los ajustes. Si falta o no es un texto decimal entre «0» y «100»,
 * vale «0» y `fallback` dice por qué (el caso de uso lo deja en el log).
 */
export function reapprovalToleranceOf(settings: unknown): ReapprovalTolerance {
  const raw =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).reapproval_tolerance_pct
      : undefined;
  if (raw === undefined || raw === null) {
    return { tolerancePct: DEFAULT_REAPPROVAL_TOLERANCE_PCT, fallback: 'missing' };
  }
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!PCT_PATTERN.test(text) || new Decimal(text).gt(100)) {
    return { tolerancePct: DEFAULT_REAPPROVAL_TOLERANCE_PCT, fallback: 'invalid' };
  }
  return { tolerancePct: text, fallback: null };
}
