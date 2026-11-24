// E1-H2 · Contratos de identity con los mensajes es-PE activos (configureZodMessages, ADR-005).
import { beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { issuesToFieldErrors } from '@/shared/validation';
import { messages } from '@/ui/messages/es-PE';
import { configureZodMessages } from '@/ui/messages/zod-error-map';

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  requestPasswordResetContract,
  resetPasswordContract,
  selectTenantContract,
  signInContract,
} from './index';

beforeAll(() => {
  configureZodMessages();
});

function fieldErrors(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? {} : issuesToFieldErrors(result.error.issues);
}

describe('signInContract', () => {
  it.each(['', '   '])('correo vacío (%j) → "Este campo es obligatorio."', (email) => {
    expect(fieldErrors(signInContract.inputSchema, { email, password: 'x' })).toEqual({
      email: [messages.validation.required],
    });
  });

  it('contraseña vacía → "Este campo es obligatorio."', () => {
    expect(fieldErrors(signInContract.inputSchema, { email: 'a@b.pe', password: '' })).toEqual({
      password: [messages.validation.required],
    });
  });

  it('correo con formato inválido → formato inválido', () => {
    expect(fieldErrors(signInContract.inputSchema, { email: 'ana', password: 'x' })).toEqual({
      email: [messages.validation.invalidFormat],
    });
  });

  it('normaliza el correo (trim y minúsculas); la contraseña no tiene política en el login', () => {
    expect(signInContract.inputSchema.parse({ email: ' Ana@Genrent.PE ', password: 'a' })).toEqual({
      email: 'ana@genrent.pe',
      password: 'a',
    });
  });
});

describe('requestPasswordResetContract', () => {
  it('correo vacío → "Este campo es obligatorio."', () => {
    expect(fieldErrors(requestPasswordResetContract.inputSchema, { email: '' })).toEqual({
      email: [messages.validation.required],
    });
  });
});

describe('resetPasswordContract', () => {
  it(`exige entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`, () => {
    const schema = resetPasswordContract.inputSchema;
    expect(fieldErrors(schema, { tokenHash: 't', password: 'a'.repeat(PASSWORD_MIN - 1) })).toEqual(
      { password: [messages.validation.tooShort(PASSWORD_MIN)] },
    );
    expect(schema.safeParse({ tokenHash: 't', password: 'a'.repeat(PASSWORD_MIN) }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ tokenHash: 't', password: 'a'.repeat(PASSWORD_MAX + 1) }).success,
    ).toBe(false);
  });
});

describe('selectTenantContract', () => {
  it('tenantId debe ser UUID', () => {
    expect(selectTenantContract.inputSchema.safeParse({ tenantId: 'tenant-a' }).success).toBe(
      false,
    );
  });
});
