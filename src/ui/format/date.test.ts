// E0-H4 · DateText (zona del tenant): UTC en la base, se muestra con la zona horaria del tenant.
import { describe, expect, it } from 'vitest';

import { formatDateTime, toIsoString } from './date';

// 23 nov 2026 03:30 UTC = 22 nov 2026 22:30 en Lima (UTC-5).
const INSTANT = '2026-11-23T03:30:00Z';

describe('formatDateTime (zona del tenant)', () => {
  it('en America/Lima muestra el día anterior y la hora local (22 nov, 10:30 p. m.)', () => {
    const text = formatDateTime(INSTANT, 'America/Lima');
    expect(text).toMatch(/^22 nov\.? 2026/);
    expect(text).toMatch(/10:30/);
    expect(text).toMatch(/p\.\s?m\./);
  });

  it('en UTC muestra el mismo instante como 23 nov a las 3:30 a. m.', () => {
    const text = formatDateTime(INSTANT, 'UTC');
    expect(text).toMatch(/^23 nov\.? 2026/);
    expect(text).toMatch(/3:30/);
    expect(text).toMatch(/a\.\s?m\./);
  });

  it('acepta un Date además del string ISO', () => {
    expect(formatDateTime(new Date(INSTANT), 'America/Lima')).toBe(
      formatDateTime(INSTANT, 'America/Lima'),
    );
  });

  it("la variante 'date' muestra solo la fecha, sin hora", () => {
    const text = formatDateTime(INSTANT, 'America/Lima', 'date');
    expect(text).toMatch(/^22 nov\.? 2026$/);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('lanza con una fecha inválida', () => {
    expect(() => formatDateTime('no-es-fecha', 'America/Lima')).toThrow();
    expect(() => formatDateTime(new Date(Number.NaN), 'America/Lima')).toThrow();
  });

  it('lanza con una zona horaria inválida', () => {
    expect(() => formatDateTime(INSTANT, 'Mars/Olympus')).toThrow();
  });
});

describe('toIsoString', () => {
  it('normaliza a ISO 8601 en UTC', () => {
    expect(toIsoString(INSTANT)).toBe('2026-11-23T03:30:00.000Z');
    expect(toIsoString('2026-11-22T22:30:00-05:00')).toBe('2026-11-23T03:30:00.000Z');
    expect(toIsoString(new Date(INSTANT))).toBe('2026-11-23T03:30:00.000Z');
  });

  it('lanza con una fecha inválida', () => {
    expect(() => toIsoString('')).toThrow();
  });
});
