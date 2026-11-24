// Código de producto, equipo, centro de costo o almacén: el texto que ve y escribe el usuario.
// Se guarda recortado y en mayúsculas (la base lo exige con un check), sin espacios, de 1 a 40
// caracteres; así basta un único (tenant_id, code) y la comparación no distingue mayúsculas.
export const CODE_MAX = 40;
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return code.length >= 1 && code.length <= CODE_MAX && CODE_PATTERN.test(code);
}
