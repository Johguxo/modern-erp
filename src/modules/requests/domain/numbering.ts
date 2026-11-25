// Numeración de documentos (§7 del flujo): prefijo y siguiente número por cliente. El prefijo
// incluye el separador ("SOF-"), sin año y sin reinicio anual (G1).
import { ConflictError, ValidationError } from '@/shared/errors';

export const PREFIX_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,15}$/;
export const PREFIX_MAX = 16;
/** Tope del siguiente número: la columna es integer y debe quedar espacio para avanzar. */
export const MAX_SEQUENCE_NUMBER = 2_000_000_000;

export const DEFAULT_SOF_SEQUENCE = {
  docType: 'SOF',
  prefix: 'SOF-',
  nextNumber: 1,
  padding: 4,
} as const;

export interface SequenceState {
  readonly prefix: string;
  readonly nextNumber: number;
  readonly padding: number;
  readonly lastIssuedNumber: number | null;
}

/** Mayúsculas y sin espacios en los extremos. */
export function normalizePrefix(raw: string): string {
  return raw.trim().toUpperCase();
}

/** "SOF-" + 143 → "SOF-0143". Si el número tiene más dígitos que el relleno, no se trunca. */
export function formatDocumentNumber(prefix: string, number: number, padding: number): string {
  return `${prefix}${String(number).padStart(padding, '0')}`;
}

/** El siguiente número no puede quedar por debajo (ni igual) al último emitido. */
export function assertNextNumberAllowed(nextNumber: number, lastIssuedNumber: number | null): void {
  if (lastIssuedNumber !== null && nextNumber <= lastIssuedNumber) {
    throw new ValidationError({
      reason: 'sequence_below_last_used',
      params: { last: lastIssuedNumber },
      fieldErrors: { sequenceNextNumber: ['sequence_below_last_used'] },
      message: `Next number ${nextNumber} is not above last issued ${lastIssuedNumber}`,
    });
  }
}

/** Emite el número actual y deja la secuencia lista para el siguiente. */
export function advance(sequence: Pick<SequenceState, 'nextNumber'>): {
  readonly issuedNumber: number;
  readonly nextNumber: number;
  readonly lastIssuedNumber: number;
} {
  const issuedNumber = sequence.nextNumber;
  if (issuedNumber >= MAX_SEQUENCE_NUMBER) {
    throw new ConflictError({ reason: 'sequence_exhausted', message: 'Sequence exhausted' });
  }
  return { issuedNumber, nextNumber: issuedNumber + 1, lastIssuedNumber: issuedNumber };
}
