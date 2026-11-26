// Edición en sitio de las líneas de un SOF ya enviado (E4-H4, «Cambios solicitados»): después del
// envío las líneas no se borran, porque `request_line_revisions` apunta a ellas. El plan empareja
// las líneas nuevas con las vigentes por producto, en orden, y dice qué actualizar, insertar o
// marcar como quitado. Puro: sin base de datos.
import type { LineInsert, RequestLine } from './request';

export interface LineUpdate {
  readonly id: string;
  /** Valores nuevos; `lineNo` es el de la línea existente (no cambia). */
  readonly line: LineInsert;
}

export interface LineSyncPlan {
  readonly updates: readonly LineUpdate[];
  readonly inserts: readonly LineInsert[];
  /** Ids de líneas vigentes que ya no están: pasan a `removed`. */
  readonly removed: readonly string[];
}

function sameValues(existing: RequestLine, next: LineInsert): boolean {
  return (
    existing.productCode === next.productCode &&
    existing.description === next.description &&
    existing.unit === next.unit &&
    existing.equipmentId === next.equipmentId &&
    existing.quantity === next.quantity &&
    existing.unitPrice === next.unitPrice &&
    existing.subtotal === next.subtotal &&
    existing.notes === next.notes
  );
}

/**
 * - Empareja por `productId` siguiendo el orden (con productos repetidos, la primera con la primera).
 * - Una línea emparejada sin cambios no genera update.
 * - Las nuevas toman el siguiente `lineNo` libre (las quitadas dejan huecos, a propósito).
 * - Las vigentes sin pareja se quitan; las que ya estaban quitadas no se tocan.
 */
export function planLineSync(
  existing: readonly RequestLine[],
  desired: readonly LineInsert[],
): LineSyncPlan {
  const pool = new Map<string, RequestLine[]>();
  for (const line of [...existing].sort((a, b) => a.lineNo - b.lineNo)) {
    if (line.status !== 'active') continue;
    const list = pool.get(line.productId) ?? [];
    list.push(line);
    pool.set(line.productId, list);
  }

  let nextLineNo = existing.reduce((max, line) => Math.max(max, line.lineNo), 0) + 1;
  const updates: LineUpdate[] = [];
  const inserts: LineInsert[] = [];
  for (const next of desired) {
    const match = pool.get(next.productId)?.shift();
    if (!match) {
      inserts.push({ ...next, lineNo: nextLineNo });
      nextLineNo += 1;
    } else if (!sameValues(match, next)) {
      updates.push({ id: match.id, line: { ...next, lineNo: match.lineNo } });
    }
  }
  const removed = [...pool.values()].flat().map((line) => line.id);
  return { updates, inserts, removed };
}
