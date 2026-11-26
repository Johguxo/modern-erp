import { describe, expect, it } from 'vitest';

import { REQUEST_ACTIONS } from '@/modules/requests';

import {
  IMPLEMENTED_ACTIONS,
  isActionEnabled,
  isImplemented,
  panelActions,
  showsSoonNote,
} from './detail-actions';

describe('isActionEnabled', () => {
  it('solo editar borrador funciona hoy', () => {
    expect(IMPLEMENTED_ACTIONS).toEqual(['edit_draft']);
    for (const action of REQUEST_ACTIONS) {
      expect(isActionEnabled(action, false)).toBe(action === 'edit_draft');
    }
  });

  it('en solo lectura ninguna acción está habilitada', () => {
    for (const action of REQUEST_ACTIONS) {
      expect(isActionEnabled(action, true)).toBe(false);
    }
    expect(isImplemented('edit_draft')).toBe(true);
  });
});

describe('panelActions y showsSoonNote', () => {
  it('corregir línea y descargar PDF no van en el panel', () => {
    expect(panelActions(['cancel', 'correct_line', 'deliver', 'download_pdf'])).toEqual([
      'cancel',
      'deliver',
    ]);
  });

  it('la nota aparece solo si el panel tiene alguna acción sin conectar', () => {
    expect(showsSoonNote(['edit_draft', 'download_pdf'])).toBe(false);
    expect(showsSoonNote(['edit_draft', 'cancel', 'download_pdf'])).toBe(true);
    expect(showsSoonNote(['correct_line', 'download_pdf'])).toBe(false);
    expect(showsSoonNote(['approve', 'request_changes', 'reject', 'download_pdf'])).toBe(true);
  });
});
