import { describe, expect, it } from 'vitest';

import type { RequestAction } from '@/modules/requests';

import { showsMobileBar } from './mobile-bar-rules';

const detail = (pendingStepId: string | null, actions: RequestAction[]) => ({
  pendingStepId,
  actions,
});

describe('showsMobileBar', () => {
  it.each([
    [
      'aprobador con paso pendiente',
      detail('s1', ['approve', 'request_changes', 'reject']),
      false,
      true,
    ],
    ['sin paso pendiente', detail(null, ['approve', 'reject']), false, false],
    ['sin aprobar', detail('s1', ['reject']), false, false],
    ['sin rechazar', detail('s1', ['approve']), false, false],
    ['solicitante (sin decisiones)', detail(null, ['cancel', 'edit_draft']), false, false],
    ['solo lectura', detail('s1', ['approve', 'reject']), true, false],
  ])('%s', (_name, input, readOnly, expected) => {
    expect(showsMobileBar(input, readOnly)).toBe(expected);
  });
});
