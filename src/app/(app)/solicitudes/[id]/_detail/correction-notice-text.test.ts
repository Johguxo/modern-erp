import { describe, expect, it } from 'vitest';

import type { CorrectionNotice } from '@/modules/requests';

import { correctionNoticeText } from './correction-notice-text';

const notice = (overrides: Partial<CorrectionNotice> = {}): CorrectionNotice => ({
  lineNo: 3,
  actorId: 'user-1',
  actorName: 'Jhony Pérez',
  changeType: 'update',
  changes: [{ field: 'equipmentId', from: 'GEN-046', to: 'GEN-045' }],
  reconfirmation: false,
  ...overrides,
});

describe('correctionNoticeText', () => {
  it('sin reconfirmación: describe el cambio y dice que las firmas se mantienen', () => {
    expect(correctionNoticeText(notice(), 'in_approval')).toEqual({
      headline: 'Línea 3 corregida por Jhony Pérez.',
      body: 'Se cambió el equipo de GEN-046 a GEN-045. Las firmas se mantienen.',
    });
  });

  it('con reconfirmación en aprobación: solo esa línea vuelve a aprobación', () => {
    expect(correctionNoticeText(notice({ reconfirmation: true }), 'in_approval').body).toBe(
      'Se cambió el equipo de GEN-046 a GEN-045. Solo esa línea vuelve a aprobación; las demás conservan sus firmas.',
    );
  });

  it('con reconfirmación ya aprobada no promete lo que ya pasó', () => {
    expect(correctionNoticeText(notice({ reconfirmation: true }), 'approved').body).toBe(
      'Se cambió el equipo de GEN-046 a GEN-045. La reconfirmación de esta línea ya fue aprobada.',
    );
  });

  it('cantidad sin ceros de más y precio con dos decimales', () => {
    const text = correctionNoticeText(
      notice({
        changes: [
          { field: 'quantity', from: '2.000', to: '3.500' },
          { field: 'unitPrice', from: '5.0000', to: '6.2500' },
        ],
      }),
      'in_approval',
    );
    expect(text.body).toBe(
      'Se cambió la cantidad de 2 a 3.5. Se cambió el precio de 5.00 a 6.25. Las firmas se mantienen.',
    );
  });

  it('equipo asignado o quitado, producto y notas', () => {
    expect(
      correctionNoticeText(
        notice({ changes: [{ field: 'equipmentId', from: null, to: 'GEN-045' }] }),
        'in_approval',
      ).body,
    ).toContain('Se asignó el equipo GEN-045.');
    expect(
      correctionNoticeText(
        notice({ changes: [{ field: 'equipmentId', from: 'GEN-046', to: null }] }),
        'in_approval',
      ).body,
    ).toContain('Se quitó el equipo GEN-046.');
    const text = correctionNoticeText(
      notice({
        changes: [
          { field: 'productId', from: 'P-1', to: 'P-2' },
          { field: 'notes', from: null, to: 'urgente' },
        ],
      }),
      'in_approval',
    );
    expect(text.body).toContain('Se cambió el producto de P-1 a P-2. Se cambiaron las notas.');
  });

  it('agregar y quitar; sin autor conocido el titular no lo nombra', () => {
    expect(
      correctionNoticeText(
        notice({ changeType: 'add', changes: [], actorName: null }),
        'in_approval',
      ),
    ).toEqual({
      headline: 'Línea 3 corregida.',
      body: 'Se agregó la línea. Las firmas se mantienen.',
    });
    expect(
      correctionNoticeText(notice({ changeType: 'remove', changes: [] }), 'in_approval').body,
    ).toBe('Se quitó la línea. Las firmas se mantienen.');
  });
});
