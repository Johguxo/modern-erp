// E1-H3 · Token de invitación: aleatorio, solo se guarda su hash, vence en 7 días.
import { describe, expect, it } from 'vitest';

import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationPath,
  isInvitationLive,
} from './invitation';

describe('token de invitación', () => {
  it('es base64url de 32 bytes (43 caracteres) y distinto cada vez', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('el hash es sha256 hex, determinista y no contiene el token', () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it('el enlace es /invitacion/<token>', () => {
    expect(invitationPath('abc')).toBe('/invitacion/abc');
  });
});

describe('vencimiento', () => {
  const now = new Date('2026-11-24T10:00:00.000Z');

  it('vence 7 días después', () => {
    expect(invitationExpiresAt(now).toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });

  it('viva si no fue aceptada y no venció; vencida o aceptada no', () => {
    const expiresAt = invitationExpiresAt(now);

    expect(isInvitationLive({ acceptedAt: null, expiresAt }, now)).toBe(true);
    expect(isInvitationLive({ acceptedAt: null, expiresAt }, expiresAt)).toBe(false);
    expect(isInvitationLive({ acceptedAt: now, expiresAt }, now)).toBe(false);
  });
});
