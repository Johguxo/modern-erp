import { describe, expect, it } from 'vitest';

import { ConflictError, ValidationError } from '@/shared/errors';

import {
  DEFAULT_SOF_SEQUENCE,
  MAX_SEQUENCE_NUMBER,
  PREFIX_PATTERN,
  advance,
  assertNextNumberAllowed,
  formatDocumentNumber,
  normalizePrefix,
} from './numbering';

describe('PREFIX_PATTERN y normalizePrefix', () => {
  it('acepta prefijos con separador', () => {
    for (const prefix of ['SOF-', 'GR-', 'A', 'SOF/2026-', 'X.Y_', '0SOF', 'ABCDEFGHIJKLMNOP']) {
      expect(PREFIX_PATTERN.test(prefix)).toBe(true);
    }
  });

  it('rechaza vacío, minúsculas, espacios, símbolos y más de 16 caracteres', () => {
    for (const prefix of ['', 'sof-', 'SO F-', '-SOF', 'SOF#', 'ABCDEFGHIJKLMNOPQ']) {
      expect(PREFIX_PATTERN.test(prefix)).toBe(false);
    }
  });

  it('normaliza a mayúsculas sin espacios en los extremos', () => {
    expect(normalizePrefix('  gr- ')).toBe('GR-');
  });

  it('el prefijo por defecto cumple el patrón', () => {
    expect(PREFIX_PATTERN.test(DEFAULT_SOF_SEQUENCE.prefix)).toBe(true);
  });
});

describe('formatDocumentNumber', () => {
  it('rellena con ceros', () => {
    expect(formatDocumentNumber('SOF-', 143, 4)).toBe('SOF-0143');
    expect(formatDocumentNumber('GR-', 500, 4)).toBe('GR-0500');
    expect(formatDocumentNumber('SOF-', 1, 4)).toBe('SOF-0001');
  });

  it('no trunca cuando el número tiene más dígitos que el relleno', () => {
    expect(formatDocumentNumber('SOF-', 12345, 4)).toBe('SOF-12345');
  });
});

describe('assertNextNumberAllowed', () => {
  it('sin número emitido se puede fijar cualquiera', () => {
    expect(() => assertNextNumberAllowed(1, null)).not.toThrow();
    expect(() => assertNextNumberAllowed(500, null)).not.toThrow();
  });

  it('exige mayor que el último emitido', () => {
    expect(() => assertNextNumberAllowed(144, 143)).not.toThrow();
    for (const next of [143, 100, 1]) {
      let error: unknown;
      try {
        assertNextNumberAllowed(next, 143);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({
        reason: 'sequence_below_last_used',
        params: { last: 143 },
        fieldErrors: { sequenceNextNumber: ['sequence_below_last_used'] },
      });
    }
  });
});

describe('advance', () => {
  it('emite el número actual y avanza', () => {
    expect(advance({ nextNumber: 144 })).toEqual({
      issuedNumber: 144,
      nextNumber: 145,
      lastIssuedNumber: 144,
    });
  });

  it('falla si la secuencia llegó al tope', () => {
    expect(() => advance({ nextNumber: MAX_SEQUENCE_NUMBER })).toThrow(ConflictError);
  });
});
