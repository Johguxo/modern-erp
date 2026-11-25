// Utilidades de búsqueda con LIKE/ILIKE compartidas por los repositorios (sin reglas de negocio).

/** Escapa % y _ (y la barra) para que el texto del usuario se busque tal cual en LIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Palabras de la búsqueda, sin vacíos. */
export function searchWords(q: string): string[] {
  return q.split(/\s+/).filter((word) => word.length > 0);
}
