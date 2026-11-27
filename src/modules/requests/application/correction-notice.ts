// Aviso «Línea N corregida» del detalle (E4-H4): qué cambió, en palabras que el texto de la pantalla
// puede componer. Puro: los rótulos de equipo ya vienen resueltos.
import type { LineCorrectedData } from './correction-data';
import type { CorrectionChange, CorrectionNotice } from './views';

/** Los campos que el aviso describe, en el orden en que se dicen. */
const FIELDS = ['productId', 'equipmentId', 'quantity', 'unitPrice', 'notes'] as const;

export function buildCorrectionNotice(
  data: LineCorrectedData,
  actor: { readonly id: string | null; readonly name: string | null },
  /** Código del equipo («GEN-045») por id; los ids que faltan quedan como «sin equipo». */
  equipmentCodes: ReadonlyMap<string, string>,
): CorrectionNotice {
  const value = (
    facts: LineCorrectedData['before'],
    field: (typeof FIELDS)[number],
  ): string | null => {
    if (!facts) return null;
    switch (field) {
      case 'productId':
        return facts.productCode ?? null;
      case 'equipmentId':
        return facts.equipmentId ? (equipmentCodes.get(facts.equipmentId) ?? null) : null;
      case 'quantity':
        return facts.quantity ?? null;
      case 'unitPrice':
        return facts.unitPrice ?? null;
      case 'notes':
        return facts.notes ?? null;
    }
  };
  const changes: CorrectionChange[] =
    data.changeType === 'update'
      ? FIELDS.filter((field) => data.changedFields.includes(field)).map((field) => ({
          field,
          from: value(data.before, field),
          to: value(data.after, field),
        }))
      : [];
  return {
    lineNo: data.lineNo,
    actorId: actor.id,
    actorName: actor.name,
    changeType: data.changeType,
    changes,
    reconfirmation: data.reconfirmation,
  };
}
