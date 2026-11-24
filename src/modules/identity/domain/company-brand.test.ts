// E1-H5 · Marca del cliente: color, lectura tolerante del jsonb, tipo de imagen por bytes y clave.
import { describe, expect, it } from 'vitest';

import { detectImageType, logoKey, normalizeHexColor, parseBrand } from './company-brand';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('normalizeHexColor', () => {
  it('acepta #RRGGBB y lo pasa a mayúsculas', () => {
    expect(normalizeHexColor(' #0a7c6e ')).toBe('#0A7C6E');
  });

  it.each(['#fff', 'red', '#12345G', '#000000;background:url(x)', ''])('rechaza %j', (value) => {
    expect(normalizeHexColor(value)).toBeNull();
  });
});

describe('parseBrand', () => {
  it('lee una marca válida', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(
      parseBrand({
        displayName: 'Genrent',
        primaryColor: '#0a7c6e',
        logoPath: `brand/logo-${id}.png`,
      }),
    ).toEqual({
      displayName: 'Genrent',
      primaryColor: '#0A7C6E',
      logoPath: `brand/logo-${id}.png`,
    });
  });

  it('descarta valores inválidos sin fallar (nunca llegan a un style)', () => {
    expect(
      parseBrand({
        displayName: 'x',
        primaryColor: 'red;background:url(x)',
        logoPath: '../otro-tenant/logo.png',
      }),
    ).toEqual({});
    expect(parseBrand(null)).toEqual({});
    expect(parseBrand('basura')).toEqual({});
  });
});

describe('detectImageType', () => {
  it('reconoce PNG, JPEG y WebP por sus primeros bytes', () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(detectImageType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it.each([
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', ascii('GIF89a')],
    ['HTML con extensión .png', ascii('<html><script>alert(1)</script>')],
    ['vacío', bytes()],
    ['RIFF que no es WebP', ascii('RIFF\0\0\0\0WAVE')],
  ])('rechaza %s', (_name, input) => {
    expect(detectImageType(input)).toBeNull();
  });
});

describe('logoKey', () => {
  it('arma brand/logo-<id>.<ext>', () => {
    expect(logoKey('abc', 'webp')).toBe('brand/logo-abc.webp');
  });
});
