import { describe, expect, it } from 'vitest';

import { REQUEST_ACTIONS } from '@/modules/requests';

import {
  IMPLEMENTED_ACTIONS,
  isActionEnabled,
  isImplemented,
  panelActions,
  showsSoonNote,
  SOON_NOTE_ID,
  soonNoteId,
} from './detail-actions';

describe('isActionEnabled', () => {
  it('editar, anular, decidir y corregir una línea funcionan hoy', () => {
    expect(IMPLEMENTED_ACTIONS).toEqual([
      'edit_draft',
      'cancel',
      'approve',
      'request_changes',
      'reject',
      'resubmit',
      'correct_line',
    ]);
    for (const action of REQUEST_ACTIONS) {
      expect(isActionEnabled(action, false)).toBe(IMPLEMENTED_ACTIONS.includes(action));
    }
  });

  it('en solo lectura ninguna acción de escritura está habilitada', () => {
    for (const action of REQUEST_ACTIONS) {
      expect(isActionEnabled(action, true)).toBe(false);
    }
    expect(isImplemented('edit_draft')).toBe(true);
  });

  it('solo lectura no bloquea las lecturas: el PDF se habilita cuando esté conectado', () => {
    // download_pdf aún no está conectado, así que sigue deshabilitado por eso y no por solo lectura.
    expect(isImplemented('download_pdf')).toBe(false);
    expect(isActionEnabled('download_pdf', true)).toBe(false);
    expect(isActionEnabled('edit_draft', true)).toBe(false);
    expect(isActionEnabled('cancel', true)).toBe(false);
  });
});

describe('panelActions y showsSoonNote', () => {
  it('corregir línea y descargar PDF no van en el panel', () => {
    expect(panelActions(['cancel', 'correct_line', 'deliver', 'download_pdf'])).toEqual([
      'cancel',
      'deliver',
    ]);
  });

  it('la nota aparece si alguna acción visible (panel, ítems o documento) está sin conectar', () => {
    expect(showsSoonNote(['edit_draft', 'cancel'])).toBe(false);
    expect(showsSoonNote(['edit_draft', 'download_pdf'])).toBe(true);
    expect(showsSoonNote(['correct_line', 'download_pdf'])).toBe(true);
    expect(showsSoonNote(['correct_line'])).toBe(false);
    expect(showsSoonNote(['approve', 'request_changes', 'reject'])).toBe(false);
    expect(showsSoonNote(['approve', 'request_changes', 'reject', 'download_pdf'])).toBe(true);
    expect(soonNoteId(['edit_draft'])).toBeUndefined();
    expect(soonNoteId(['cancel', 'download_pdf'])).toBe(SOON_NOTE_ID);
  });
});
