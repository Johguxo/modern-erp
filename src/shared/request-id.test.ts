// E0-H3 · requestId: se acepta el de la cabecera solo si es seguro para logs.
import {
  SequentialIdGenerator,
  sequentialUuid,
} from '@tests/support/fakes/sequential-id-generator';
import { describe, expect, it } from 'vitest';

import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('la cabecera es x-request-id', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });

  it.each([
    'abcdefgh',
    'req_2026.11-23_ABC',
    'a'.repeat(128),
    '0b8f6c1e-4a7d-4e7b-9d1c-1f2e3d4c5b6a',
  ])('acepta un id válido: %s', (header) => {
    expect(resolveRequestId(header, new SequentialIdGenerator())).toBe(header);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['vacío', ''],
    ['corto (7)', 'abcdefg'],
    ['largo (129)', 'a'.repeat(129)],
    ['inyección de líneas en logs', 'abcdefgh\n{"level":60}'],
    ['espacios', 'abc def ghi'],
    ['caracteres de HTML', '<script>alert(1)</script>'],
    ['comillas', 'abcdefgh"'],
  ])('reemplaza un id inválido (%s) por uno nuevo', (_label, header) => {
    const ids = new SequentialIdGenerator();

    expect(resolveRequestId(header, ids)).toBe(sequentialUuid(1));
  });
});
