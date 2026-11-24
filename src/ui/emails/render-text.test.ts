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
});
