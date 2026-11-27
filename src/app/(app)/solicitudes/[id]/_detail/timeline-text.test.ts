import { describe, expect, it } from 'vitest';

import { assigneeList, itemComment, pendingHint, stepTitle } from './timeline-text';

describe('stepTitle', () => {
  it('el paso aprobado lleva el nombre del paso tal como se escribió', () => {
    expect(stepTitle({ kind: 'step_approved', stepName: 'Almacén' })).toBe('Aprobado por Almacén');
  });

  it('la firma parcial dice «Aprobación parcial» con el nombre del paso', () => {
    expect(stepTitle({ kind: 'step_signed', stepName: 'Almacén' })).toBe(
      'Aprobación parcial · Almacén',
    );
    expect(stepTitle({ kind: 'step_signed', stepName: null })).toBe('Aprobación parcial');
  });

  it('el paso pendiente o en espera muestra su nombre', () => {
    expect(stepTitle({ kind: 'approval', stepName: 'Gerencia local' })).toBe('Gerencia local');
  });

  it('sin nombre de paso usa el título genérico', () => {
    expect(stepTitle({ kind: 'approval', stepName: null })).toBe('Aprobación');
    expect(stepTitle({ kind: 'step_approved', stepName: null })).toBe('Paso aprobado');
    expect(stepTitle({ kind: 'resubmitted', stepName: null })).toBe('Reenviada a aprobación');
    expect(stepTitle({ kind: 'submitted', stepName: null })).toBe('Enviada a aprobación');
  });

  it('los hitos que no son de un paso ignoran el nombre', () => {
    expect(stepTitle({ kind: 'rejected', stepName: 'Almacén' })).toBe('Rechazada');
  });
});

describe('stepTitle · correcciones de línea (E4-H4)', () => {
  it('«Línea 3 corregida» y «Reconfirmación pedida · línea 3»', () => {
    expect(stepTitle({ kind: 'line_corrected', stepName: null, lineNos: [3] })).toBe(
      'Línea 3 corregida',
    );
    expect(
      stepTitle({ kind: 'reconfirmation_requested', stepName: 'Reconfirmación', lineNos: [3] }),
    ).toBe('Reconfirmación pedida · línea 3');
    expect(
      stepTitle({ kind: 'reconfirmation_requested', stepName: 'Reconfirmación', lineNos: [2, 3] }),
    ).toBe('Reconfirmación pedida · líneas 2 y 3');
  });

  it('sin número de línea usa el título genérico', () => {
    expect(stepTitle({ kind: 'line_corrected', stepName: null, lineNos: [] })).toBe(
      'Línea corregida',
    );
  });
});

describe('itemComment', () => {
  it('la corrección muestra su motivo; la reconfirmación no lo repite', () => {
    expect(itemComment({ kind: 'line_corrected', comment: 'Equipo equivocado' })).toEqual({
      label: 'Motivo',
      text: 'Equipo equivocado',
    });
    expect(
      itemComment({ kind: 'reconfirmation_requested', comment: 'Equipo equivocado' }),
    ).toBeNull();
    expect(itemComment({ kind: 'rejected', comment: 'No' })).toEqual({
      label: 'Comentario',
      text: 'No',
    });
    expect(itemComment({ kind: 'approved', comment: null })).toBeNull();
  });
});

describe('assigneeList', () => {
  it('con la regla any usa «o»', () => {
    expect(assigneeList(['Ruby', 'Sergio'], 'any')).toBe('Ruby o Sergio');
    expect(assigneeList(['Ruby', 'Sergio', 'Ana'], 'any')).toBe('Ruby, Sergio o Ana');
  });

  it('con la regla all usa «y»', () => {
    expect(assigneeList(['Ruby', 'Sergio'], 'all')).toBe('Ruby y Sergio');
  });

  it('uno solo, sin regla y vacío', () => {
    expect(assigneeList(['Ruby'], 'any')).toBe('Ruby');
    expect(assigneeList(['Ruby', 'Sergio'], null)).toBe('Ruby o Sergio');
    expect(assigneeList([], 'any')).toBe('');
  });
});

describe('pendingHint', () => {
  const pending = (overrides: Partial<Parameters<typeof pendingHint>[0]> = {}) => ({
    stepName: 'Almacén',
    assigneeCount: 2,
    assigneeNames: ['Ruby', 'Sergio'],
    rule: 'any' as const,
    at: '2026-11-25T14:00:00.000Z',
    ...overrides,
  });

  it('con asignados: quiénes y desde cuándo', () => {
    expect(pendingHint(pending())).toEqual({
      kind: 'assignees',
      who: 'Ruby o Sergio',
      since: '2026-11-25T14:00:00.000Z',
    });
  });

  it('pendiente sin fecha: solo los asignados', () => {
    expect(pendingHint(pending({ at: null }))).toEqual({
      kind: 'assignees',
      who: 'Ruby o Sergio',
      since: null,
    });
  });

  it('asignados sin nombre: solo desde cuándo, no «sin aprobadores»', () => {
    expect(pendingHint(pending({ assigneeNames: [] }))).toEqual({
      kind: 'assignees',
      who: '',
      since: '2026-11-25T14:00:00.000Z',
    });
  });

  it('sin asignados: «Sin aprobadores asignados»', () => {
    expect(pendingHint(pending({ assigneeCount: 0, assigneeNames: [] }))).toEqual({
      kind: 'message',
      text: 'Sin aprobadores asignados',
    });
  });

  it('sin nombre de paso (línea derivada) usa el mensaje genérico', () => {
    expect(pendingHint(pending({ stepName: null }))).toEqual({
      kind: 'message',
      text: 'Esperando la decisión de los aprobadores.',
    });
  });
});
