// E1-H2 · applyActionError lleva los fieldErrors de un ActionError a React Hook Form (ADR-005).
import { describe, expect, it, vi } from 'vitest';

import type { ActionError } from '@/shared/result';

import { applyActionError } from './apply-action-error';

type Values = { email: string; lines: { quantity: number }[] };

function setup(error: ActionError) {
  const setError = vi.fn();
  applyActionError<Values>(setError, error);
  return setError.mock.calls as [string, { type: string; message: string }][];
}

describe('applyActionError', () => {
  it('cada fieldError va a su campo (rutas con punto) con el primer mensaje', () => {
    const calls = setup({
      code: 'VALIDATION',
      message: 'Revisa los campos marcados.',
      requestId: 'req-1',
      fieldErrors: {
        email: ['Correo inválido.', 'Otro mensaje'],
        'lines.1.quantity': ['Debe ser al menos 1.'],
      },
    });

    expect(calls).toContainEqual(['email', { type: 'server', message: 'Correo inválido.' }]);
    expect(calls).toContainEqual([
      'lines.1.quantity',
      { type: 'server', message: 'Debe ser al menos 1.' },
    ]);
  });

  it('root no se aplica como campo; el mensaje general va a root.server', () => {
    const calls = setup({
      code: 'VALIDATION',
      message: 'Revisa los campos marcados.',
      requestId: 'req-1',
      fieldErrors: { root: ['Este campo es obligatorio.'] },
    });

    expect(calls.map(([name]) => name)).toEqual(['root.server']);
    expect(calls[0]?.[1]).toEqual({ type: 'server', message: 'Revisa los campos marcados.' });
  });

  it('sin fieldErrors solo fija root.server (p. ej. "Correo o contraseña incorrectos.")', () => {
    const calls = setup({
      code: 'UNAUTHENTICATED',
      message: 'Correo o contraseña incorrectos.',
      requestId: 'req-1',
    });

    expect(calls).toEqual([
      ['root.server', { type: 'server', message: 'Correo o contraseña incorrectos.' }],
    ]);
  });

  it('un campo con lista vacía se ignora', () => {
    const calls = setup({
      code: 'VALIDATION',
      message: 'm',
      requestId: 'req-1',
      fieldErrors: { email: [] },
    });

    expect(calls.map(([name]) => name)).toEqual(['root.server']);
  });
});
