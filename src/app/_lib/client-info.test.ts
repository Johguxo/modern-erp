// E1-H3 · IP (primer x-forwarded-for) y navegador para la auditoría, recortados.
import { describe, expect, it } from 'vitest';

import { clientInfoFromHeaders } from './client-info';

describe('clientInfoFromHeaders', () => {
  it('toma el primer x-forwarded-for y el user-agent', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      'user-agent': 'Mozilla/5.0',
    });
    expect(clientInfoFromHeaders(headers)).toEqual({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0' });
  });

  it('sin encabezados → null; un user-agent enorme se recorta', () => {
    expect(clientInfoFromHeaders(new Headers())).toEqual({ ip: null, userAgent: null });
    const long = 'a'.repeat(2000);
    expect(clientInfoFromHeaders(new Headers({ 'user-agent': long })).userAgent).toHaveLength(512);
  });
});
