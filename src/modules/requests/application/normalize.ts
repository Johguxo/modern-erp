// Texto opcional: en blanco → null.
export function normalizeBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  return text === '' ? null : text;
}
