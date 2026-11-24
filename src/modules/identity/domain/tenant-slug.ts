// Slug de un cliente (E1-H4): mismo formato que el check de la base (tenants_slug_format), de 3 a
// 40 caracteres, y sin palabras reservadas (rutas y subdominios futuros; ADR-002 §6).
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'ayuda',
  'bandeja',
  'configuracion',
  'elegir-empresa',
  'help',
  'invitacion',
  'linkus',
  'login',
  'logout',
  'mail',
  'platform',
  'recuperar',
  'restablecer',
  'root',
  'soporte',
  'static',
  'status',
  'support',
  'system',
  'www',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Propuesta de slug a partir del nombre (sin tildes, minúsculas, guiones). */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}
