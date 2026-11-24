// E1-H3 · El correo de invitación lleva el enlace, la empresa y el vencimiento, en texto simple.
import { describe, expect, it } from 'vitest';

import { renderEmailText } from './render-text';

describe('renderEmailText', () => {
  it('identity.invitation: asunto con la empresa y texto con el enlace y los días', () => {
    const url = 'http://localhost:3000/invitacion/abc123';
    const mail = renderEmailText({
      to: ['ana@genrent.pe'],
      template: 'identity.invitation',
      data: { tenantName: 'Genrent', url, expiresInDays: 7 },
      tenantId: null,
      locale: 'es-PE',
    });

    expect(mail.subject).toBe('Te invitaron a Genrent en LinkUs');
    expect(mail.text).toContain(url);
    expect(mail.text).toContain('Genrent');
    expect(mail.text).toContain('7 días');
  });

  it('identity.invitation: solo empresa, enlace y vencimiento; sin el correo del invitado ni otros datos', () => {
    const url = 'http://localhost:3000/invitacion/abc123';
    const mail = renderEmailText({
      to: ['ana@genrent.pe'],
      template: 'identity.invitation',
      data: { tenantName: 'Genrent', url, expiresInDays: 7, secret: 'no-debe-salir' },
      tenantId: '11111111-1111-4111-8111-111111111111',
      locale: 'es-PE',
    });

    const all = `${mail.subject}
${mail.text}`;
    expect(all).not.toContain('ana@genrent.pe');
    expect(all).not.toContain('no-debe-salir');
    expect(all).not.toContain('11111111-1111-4111-8111-111111111111');
    // Texto simple: sin HTML.
    expect(all).not.toMatch(/<[a-z]/i);
    // El vencimiento se expresa en días (no hay fecha que convertir a la zona del tenant).
    expect(mail.text).toContain('El enlace vence en 7 días.');
  });
});
