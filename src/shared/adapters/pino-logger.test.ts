// E0-H3 · Logger estructurado (pino) con requestId y redacción de datos sensibles.
import { describe, expect, it } from 'vitest';

import { createLogger, serializeError } from './pino-logger';

function capture() {
  const lines: string[] = [];
  const destination = { write: (chunk: string) => void lines.push(chunk) };
  const records = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { destination, lines, records };
}

describe('createLogger (pino)', () => {
  it('escribe una línea JSON con nivel, mensaje, campos y servicio', () => {
    const out = capture();
    const logger = createLogger({ level: 'info', destination: out.destination });

    logger.info({ orderId: 'o-1' }, 'hello');

    const [record] = out.records();
    expect(out.lines).toHaveLength(1);
    expect(record).toMatchObject({ level: 30, msg: 'hello', orderId: 'o-1', service: 'linkus' });
    expect(record?.time).toBeTypeOf('string');
  });

  it('child agrega requestId a cada línea', () => {
    const out = capture();
    const logger = createLogger({ level: 'debug', destination: out.destination });

    const child = logger.child({ requestId: 'req-12345678' });
    child.info({}, 'one');
    child.child({ tenantId: 't-1' }).warn({}, 'two');

    expect(out.records()).toEqual([
      expect.objectContaining({ msg: 'one', requestId: 'req-12345678' }),
      expect.objectContaining({ msg: 'two', requestId: 'req-12345678', tenantId: 't-1' }),
    ]);
  });

  it('redacta password, token anidado, authorization y cookie', () => {
    const out = capture();
    const logger = createLogger({ level: 'info', destination: out.destination });

    logger.info(
      {
        password: 'p4ss-secreta',
        user: { token: 'tok-secreto', newPassword: 'nueva-secreta' },
        authorization: 'Bearer abc-secreto',
        headers: { authorization: 'Bearer h-secreto', cookie: 'sb=cookie-secreta' },
        cookie: 'c-secreta',
      },
      'login',
    );

    const raw = out.lines.join('');
    for (const secret of [
      'p4ss-secreta',
      'tok-secreto',
      'nueva-secreta',
      'abc-secreto',
      'h-secreto',
      'cookie-secreta',
      'c-secreta',
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(out.records()[0]).toMatchObject({
      password: '[redacted]',
      user: { token: '[redacted]' },
      authorization: '[redacted]',
      cookie: '[redacted]',
    });
  });

  it("nivel 'silent' no escribe nada", () => {
    const out = capture();
    const logger = createLogger({ level: 'silent', destination: out.destination });

    logger.error({}, 'nope');
    logger.child({ requestId: 'x' }).info({}, 'nope');

    expect(out.lines).toEqual([]);
  });

  it('respeta el nivel mínimo (info no escribe debug)', () => {
    const out = capture();
    const logger = createLogger({ level: 'info', destination: out.destination });

    logger.debug({}, 'hidden');

    expect(out.lines).toEqual([]);
  });

  it('err se serializa sin los parámetros de la consulta', () => {
    const out = capture();
    const logger = createLogger({ level: 'info', destination: out.destination });
    const drizzleError = Object.assign(
      new Error('Failed query: insert into users values ($1)\nparams: dni-12345678'),
      { query: 'insert into users values ($1)', params: ['dni-12345678'] },
    );

    logger.error({ err: drizzleError }, 'unexpected error');

    expect(out.lines.join('')).not.toContain('dni-12345678');
    expect(out.records()[0]).toMatchObject({ err: { query: 'insert into users values ($1)' } });
  });
});

describe('serializeError', () => {
  it('de un error de Drizzle conserva query y code de la causa, sin params ni message con params', () => {
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: 'users_email_key',
      parameters: ['ana@correo.pe'],
    });
    const drizzleError = Object.assign(
      new Error('Failed query: insert into users (email) values ($1)\nparams: ana@correo.pe'),
      {
        query: 'insert into users (email) values ($1)',
        params: ['ana@correo.pe'],
        cause: driverError,
      },
    );

    const serialized = serializeError(drizzleError);

    expect(JSON.stringify(serialized)).not.toContain('ana@correo.pe');
    expect(serialized).toMatchObject({
      type: 'Error',
      query: 'insert into users (email) values ($1)',
      cause: { code: '23505', constraint: 'users_email_key' },
    });
    expect(serialized?.message).toBeUndefined();
    expect(serialized?.stack).toBeUndefined();
  });

  it('un Error normal conserva type, message y stack', () => {
    const serialized = serializeError(new TypeError('boom'));

    expect(serialized).toMatchObject({ type: 'TypeError', message: 'boom' });
    expect(serialized?.stack).toContain('boom');
  });

  it('primitivos y undefined', () => {
    expect(serializeError(undefined)).toBeUndefined();
    expect(serializeError('texto')).toEqual({ type: 'string', message: '"texto"' });
  });
});
