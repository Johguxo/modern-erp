// E1-H5 · Texto legible sobre el color del cliente.
import { describe, expect, it } from 'vitest';

import { readableTextTone, relativeLuminance } from './color';

describe('readableTextTone', () => {
  it.each(['#000000', '#0F172A', '#7A1F1F', '#0A7C6E'])('fondo oscuro %s → texto claro', (hex) => {
    expect(readableTextTone(hex)).toBe('light');
  });

  it.each(['#FFFFFF', '#F5D90A', '#38BDF8'])('fondo claro %s → texto oscuro', (hex) => {
    expect(readableTextTone(hex)).toBe('dark');
  });

  it('luminancia en los extremos', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(() => relativeLuminance('red')).toThrow();
  });
});
