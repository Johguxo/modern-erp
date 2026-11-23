// E0-H4 · Tokens de docs/ui/design-tokens.md como variables CSS y componentes shadcn instalados.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const tokensDoc = read('docs', 'ui', 'design-tokens.md');
const globalsCss = read('src', 'app', 'globals.css').toLowerCase();

/** Texto de la sección `## <title>` del doc, hasta el siguiente `## `. */
function section(title: string): string {
  const start = tokensDoc.indexOf(`## ${title}`);
  if (start < 0) throw new Error(`Section not found: ${title}`);
  const end = tokensDoc.indexOf('\n## ', start + 1);
  return tokensDoc.slice(start, end < 0 ? undefined : end);
}

function hexesIn(text: string): string[] {
  return [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((hex) => hex.toLowerCase()))];
}

const colorHexes = hexesIn(section('Colores'));
const badgeHexes = hexesIn(section('Pastillas de estado'));

describe('Tokens de design-tokens.md como variables CSS', () => {
  it('el doc tiene las tablas de colores y de pastillas', () => {
    // 18 tokens en 16 filas (la de warning trae 3 hex) y 6 pastillas con fondo y texto.
    expect(colorHexes.length).toBeGreaterThanOrEqual(18);
    expect(badgeHexes).toHaveLength(12);
  });

  it.each(colorHexes)('el color %s está en globals.css', (hex) => {
    expect(globalsCss).toContain(hex);
  });

  it.each(badgeHexes)('el color de pastilla %s está en globals.css', (hex) => {
    expect(globalsCss).toContain(hex);
  });

  it('expone las fuentes Inter y Space Grotesk de next/font en el tema', () => {
    expect(globalsCss).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    expect(globalsCss).toMatch(/--font-heading:\s*var\(--font-space-grotesk\)/);
  });
});

describe('Componentes shadcn instalados en src/ui/components', () => {
  const shadcn = section('Componentes shadcn a instalar');
  const names = [...shadcn.matchAll(/`([a-z-]+)`/g)].map((match) => match[1] ?? '');

  it('el doc lista los 18 componentes', () => {
    expect(names).toHaveLength(18);
  });

  it.each(names)('existe src/ui/components/%s.tsx', (name) => {
    expect(existsSync(path.join(ROOT, 'src', 'ui', 'components', `${name}.tsx`))).toBe(true);
  });
});
