// Contraste de texto sobre un color de fondo (WCAG 2.x, luminancia relativa). Para el monograma
// del cliente (E1-H5): texto blanco sobre colores oscuros y tinta sobre colores claros.
const HEX = /^#([0-9A-Fa-f]{6})$/;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = HEX.exec(hex);
  if (!match?.[1]) throw new Error('Expected #RRGGBB');
  const n = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 'light' (texto blanco) u 'dark' (texto tinta), el que contraste más con el fondo. */
export function readableTextTone(background: string): 'light' | 'dark' {
  const bg = relativeLuminance(background);
  const white = 1;
  const ink = relativeLuminance('#0F172A');
  return contrast(bg, white) >= contrast(bg, ink) ? 'light' : 'dark';
}
