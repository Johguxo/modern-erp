// E1-H3 · Selección del Mailer (Resend > Mailpit > ninguno) y envío a Mailpit por HTTP.
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { describe, expect, it, vi } from 'vitest';

import type { MailMessage } from '../ports/mailer';

import { createMailer, mailerKind, parseMailFrom } from './mailers';

const message: MailMessage = {
  to: ['ana@genrent.pe'],
  template: 'identity.invitation',
  data: { tenantName: 'Genrent', url: 'http://x/invitacion/t', expiresInDays: 7 },
  tenantId: null,
  locale: 'es-PE',
};
const render = () => ({ subject: 'Asunto', text: 'Texto' });
const from = 'LinkUs <notificaciones@linkus.pe>';

describe('mailerKind', () => {
  it('Resend manda sobre Mailpit; sin ninguno → none', () => {
    expect(mailerKind({ from, resendApiKey: 're_x', mailpitUrl: 'http://m' })).toBe('resend');
    expect(mailerKind({ from, mailpitUrl: 'http://m' })).toBe('mailpit');
    expect(mailerKind({ from })).toBe('none');
  });

  it('en producción ignora MAILPIT_URL (sin Resend → none), salvo un build local', () => {
    const mailpitUrl = 'http://127.0.0.1:54324';
    expect(
      mailerKind({ from, mailpitUrl, production: true, appUrl: 'https://app.linkus.pe' }),
    ).toBe('none');
    expect(mailerKind({ from, mailpitUrl, production: true })).toBe('none');
    expect(
      mailerKind({ from, mailpitUrl, production: true, appUrl: 'http://localhost:3000' }),
    ).toBe('mailpit');
    expect(
      mailerKind({ from, mailpitUrl, production: false, appUrl: 'https://app.linkus.pe' }),
    ).toBe('mailpit');
    expect(
      mailerKind({
        from,
        mailpitUrl,
        resendApiKey: 're_x',
        production: true,
        appUrl: 'https://app.linkus.pe',
      }),
    ).toBe('resend');
  });

  it('en producción con solo MAILPIT_URL: avisa en el log y no envía a Mailpit', async () => {
    const logger = new CapturingLogger();
    const fetchSpy = vi.fn();
    const mailer = createMailer(
      {
        from,
        mailpitUrl: 'http://127.0.0.1:54324',
        production: true,
        appUrl: 'https://app.linkus.pe',
      },
      { render, logger, fetch: fetchSpy },
    );

    await expect(mailer.send(message)).rejects.toThrow('Mailer not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.find('MAILPIT_URL ignored in production; set RESEND_API_KEY')?.level).toBe(
      'warn',
    );
  });
});

describe('parseMailFrom', () => {
  it('separa nombre y correo', () => {
    expect(parseMailFrom(from)).toEqual({ name: 'LinkUs', email: 'notificaciones@linkus.pe' });
  });
});

describe('createMailer', () => {
  it('Mailpit: POST /api/v1/send con From, To, Subject y Text', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ID: 'msg-1' }), { status: 200 })),
    );
    const mailer = createMailer(
      { from, mailpitUrl: 'http://127.0.0.1:54324' },
      { render, logger: new CapturingLogger(), fetch: fetchMock },
    );

    expect(await mailer.send(message)).toEqual({ messageId: 'msg-1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:54324/api/v1/send');
    expect(JSON.parse(init.body as string)).toEqual({
      From: { Email: 'notificaciones@linkus.pe', Name: 'LinkUs' },
      To: [{ Email: 'ana@genrent.pe' }],
      Subject: 'Asunto',
      Text: 'Texto',
    });
  });

  it('Mailpit con error HTTP → lanza', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('no', { status: 500 })));
    const mailer = createMailer(
      { from, mailpitUrl: 'http://127.0.0.1:54324' },
      { render, logger: new CapturingLogger(), fetch: fetchMock },
    );

    await expect(mailer.send(message)).rejects.toThrow(/500/);
  });

  it('sin proveedor: falla y registra un error', async () => {
    const logger = new CapturingLogger();
    const mailer = createMailer({ from }, { render, logger });

    await expect(mailer.send(message)).rejects.toThrow();
    expect(logger.entries.at(0)?.level).toBe('error');
  });
});
