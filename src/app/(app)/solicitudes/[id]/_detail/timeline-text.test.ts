import { describe, expect, it } from 'vitest';

import { assigneeList, stepTitle } from './timeline-text';

describe('stepTitle', () => {
  it('el paso aprobado lleva el nombre del paso tal como se escribió', () => {
    expect(stepTitle({ kind: 'step_approved', stepName: 'Almacén' })).toBe('Aprobado por Almacén');
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
