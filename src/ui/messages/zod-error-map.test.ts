// E0-H3 · Mensajes de validación de Zod en es-PE (decisión 2 del plan).
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { messages } from './es-PE';
import { configureZodMessages } from './zod-error-map';

const v = messages.validation;

function firstMessage(schema: z.ZodType, input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Se esperaba un error de validación');
  const [issue] = result.error.issues;
  if (!issue) throw new Error('Sin issues');
  return issue.message;
}

beforeAll(() => {
  configureZodMessages();
  configureZodMessages(); // idempotente
});

describe('mensajes de Zod en es-PE tras configureZodMessages()', () => {
  it('campo requerido: undefined', () => {
    expect(firstMessage(z.object({ name: z.string() }), {})).toBe(v.required);
  });

  it('campo requerido: null', () => {
    expect(firstMessage(z.number(), null)).toBe(v.required);
  });

  it('campo requerido: string vacío con min(1)', () => {
    expect(firstMessage(z.string().min(1), '')).toBe(v.required);
  });

  it('tipo incorrecto con valor presente → genérico', () => {
    expect(firstMessage(z.number(), 'abc')).toBe(v.invalid);
  });

  it('mínimo y máximo de número', () => {
    expect(firstMessage(z.number().min(1), 0)).toBe('Debe ser al menos 1.');
    expect(firstMessage(z.number().max(10), 11)).toBe('Debe ser como máximo 10.');
  });

  it('mínimo y máximo de string (caracteres)', () => {
    expect(firstMessage(z.string().min(3), 'ab')).toBe('Debe tener al menos 3 caracteres.');
    expect(firstMessage(z.string().max(5), 'abcdef')).toBe('Debe tener como máximo 5 caracteres.');
  });

  it('límites estrictos de número: positive, gt y lt', () => {
    expect(firstMessage(z.number().positive(), 0)).toBe('Debe ser mayor que 0.');
    expect(firstMessage(z.number().gt(5), 5)).toBe('Debe ser mayor que 5.');
    expect(firstMessage(z.number().lt(10), 10)).toBe('Debe ser menor que 10.');
  });

  it('arreglos: al menos un elemento, mínimo y máximo', () => {
    expect(firstMessage(z.array(z.string()).min(1), [])).toBe(v.atLeastOneItem);
    expect(firstMessage(z.array(z.string()).min(3), ['a'])).toBe('Agrega al menos 3 elementos.');
    expect(firstMessage(z.array(z.string()).max(1), ['a', 'b'])).toBe(
      'Puedes agregar como máximo 1 elementos.',
    );
  });

  it('fecha fuera de rango → genérico (no un timestamp)', () => {
    const message = firstMessage(z.date().min(new Date('2026-01-01')), new Date('2025-01-01'));
    expect(message).toBe(v.invalid);
  });

  it('email y uuid → formato no válido', () => {
    expect(firstMessage(z.email(), 'no-es-correo')).toBe(v.invalidFormat);
    expect(firstMessage(z.uuid(), '123')).toBe(v.invalidFormat);
  });

  it('otros errores (enum, refine sin mensaje) → mensaje genérico', () => {
    expect(firstMessage(z.enum(['a', 'b']), 'c')).toBe(v.invalid);
    expect(
      firstMessage(
        z.string().refine(() => false),
        'x',
      ),
    ).toBe(v.invalid);
  });

  it('un mensaje explícito del esquema tiene prioridad', () => {
    expect(firstMessage(z.string().min(3, 'propio'), 'a')).toBe('propio');
  });

  it('todos los mensajes están en español (no quedan los de Zod en inglés)', () => {
    const samples = [
      firstMessage(z.string(), undefined),
      firstMessage(z.number(), 'x'),
      firstMessage(z.number().min(1), 0),
      firstMessage(z.string().max(1), 'ab'),
      firstMessage(z.email(), 'x'),
      firstMessage(z.enum(['a']), 'z'),
    ];
    for (const message of samples) {
      expect(message).not.toMatch(/invalid|expected|too (small|big)|received/i);
      const known = [v.required, v.invalidFormat, v.invalid] as string[];
      expect(known.includes(message) || message.startsWith('Debe ')).toBe(true);
    }
  });
});
