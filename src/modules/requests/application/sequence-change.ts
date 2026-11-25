// Regla común de editar la secuencia (la usan la empresa y la consola): prefijo normalizado y el
// siguiente número nunca por debajo del último emitido. Devuelve solo lo que cambió.
import { assertNextNumberAllowed, normalizePrefix, type SequenceState } from '../domain/numbering';

import type { DocType } from './ports';

export const SOF: DocType = 'SOF';

export interface SequenceChangeInput {
  readonly prefix: string;
  readonly nextNumber: number;
}

export interface SequenceChange {
  readonly patch: { prefix?: string; nextNumber?: number };
  /** { campo: { from, to } } para la auditoría; vacío si no cambió nada. */
  readonly changes: Record<string, { from: unknown; to: unknown }>;
}

export function planSequenceChange(
  current: SequenceState,
  input: SequenceChangeInput,
): SequenceChange {
  const prefix = normalizePrefix(input.prefix);
  assertNextNumberAllowed(input.nextNumber, current.lastIssuedNumber);

  const patch: { prefix?: string; nextNumber?: number } = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (prefix !== current.prefix) {
    patch.prefix = prefix;
    changes.prefix = { from: current.prefix, to: prefix };
  }
  if (input.nextNumber !== current.nextNumber) {
    patch.nextNumber = input.nextNumber;
    changes.nextNumber = { from: current.nextNumber, to: input.nextNumber };
  }
  return { patch, changes };
}
