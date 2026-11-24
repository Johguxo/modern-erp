// E1-H3 · En producción (RESEND_API_KEY) el correo sale por Resend en texto simple, con la clave de
// idempotencia; un error de Resend se propaga (la invitación responde emailSent: false).
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MailMessage } from '../ports/mailer';

import { createMailer } from './mailers';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const message: MailMessage = {
  to: ['ana@genrent.pe'],
  template: 'identity.invitation',
  data: { tenantName: 'Genrent', url: 'http://x/invitacion/t', expiresInDays: 7 },
  tenantId: null,
  locale: 'es-PE',
  idempotencyKey: 'invitation-1-abc',
};
const render = () => ({ subject: 'Asunto', text: 'Texto' });
const config = {
  from: 'LinkUs <notificaciones@linkus.pe>',
  resendApiKey: 're_test',
  mailpitUrl: 'http://127.0.0.1:54324',
};

beforeEach(() => {
  send.mockReset();
});

describe('Mailer con Resend', () => {
  it('Resend manda sobre Mailpit: envía texto simple con la clave de idempotencia', async () => {
    send.mockResolvedValue({ data: { id: 'res-1' }, error: null });
    const fetchMock = vi.fn();
    const mailer = createMailer(config, {
      render,
      logger: new CapturingLogger(),
      fetch: fetchMock,
    });

    expect(await mailer.send(message)).toEqual({ messageId: 'res-1' });
    expect(send).toHaveBeenCalledWith(
      {
        from: 'LinkUs <notificaciones@linkus.pe>',
        to: ['ana@genrent.pe'],
        subject: 'Asunto',
        text: 'Texto',
      },
      { idempotencyKey: 'invitation-1-abc' },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un error de Resend se lanza', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'invalid key' } });
    const mailer = createMailer(config, { render, logger: new CapturingLogger() });

    await expect(mailer.send(message)).rejects.toThrow('Resend send failed');
  });
});
