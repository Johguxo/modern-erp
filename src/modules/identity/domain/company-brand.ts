// Marca del cliente (E1-H5): nombre visible, color principal y logo, guardados en
// tenant_settings.brand (jsonb). Reglas puras: color, tipo de imagen por sus primeros bytes, tamaño
// y la clave del archivo en Storage.
import { z } from 'zod';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 80;
export const MAX_LOGO_BYTES = 512 * 1024;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** #rrggbb → #RRGGBB; null si no es un color de 6 dígitos. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * Lo que hay en tenant_settings.brand. Se valida también al leer: un valor inválido (jsonb editado
 * a mano, versión vieja) se descarta y se usa el de por defecto, para que nunca llegue a un style.
 */
export const brandSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN)
    .max(DISPLAY_NAME_MAX)
    .optional()
    .catch(undefined),
  primaryColor: z
    .string()
    .regex(HEX_COLOR_PATTERN)
    .transform((v) => v.toUpperCase())
    .optional()
    .catch(undefined),
  logoPath: z
    .string()
    .regex(/^brand\/logo-[0-9a-f-]{36}\.(png|jpg|webp)$/)
    .optional()
    .catch(undefined),
});
export type Brand = z.infer<typeof brandSchema>;

export function parseBrand(raw: unknown): Brand {
  const result = brandSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}

export type LogoType = 'png' | 'jpg' | 'webp';

export const LOGO_CONTENT_TYPES: Readonly<Record<LogoType, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

/** Tipo real de la imagen por sus primeros bytes (no por la extensión ni el type del cliente). */
export function detectImageType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  // RIFF????WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'webp';
  }
  return null;
}

/** Clave del logo dentro de la carpeta del tenant (el adaptador antepone `${tenantId}/`). */
export function logoKey(id: string, type: LogoType): string {
  return `brand/logo-${id}.${type}`;
}
