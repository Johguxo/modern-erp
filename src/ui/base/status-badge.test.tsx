// E0-H4 · StatusBadge (texto + color): cada estado lleva su texto en es-PE y su tono de color.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { messages } from '@/ui/messages/es-PE';

import { StatusBadge, statusTone, type BadgeStatus, type StatusTone } from './status-badge';

const EXPECTED_TONE: Record<BadgeStatus, StatusTone> = {
  draft: 'neutral',
  in_approval: 'in-approval',
  changes_requested: 'pending',
  approved: 'approved',
  delivered: 'approved',
  rejected: 'rejected',
  cancelled: 'neutral',
  awaiting_my_approval: 'pending',
  awaiting_external: 'external',
  user_active: 'approved',
  user_disabled: 'neutral',
  catalog_active: 'approved',
  catalog_inactive: 'neutral',
  subscription_trial: 'external',
  subscription_active: 'approved',
  subscription_past_due: 'pending',
  subscription_suspended: 'rejected',
  subscription_cancelled: 'neutral',
  subscription_none: 'neutral',
  import_pending: 'pending',
  import_processing: 'in-approval',
  import_completed: 'approved',
  import_failed: 'rejected',
};

const STATUSES = Object.keys(messages.status) as BadgeStatus[];

describe('StatusBadge (texto + color)', () => {
  it('cubre todos los estados de messages.status', () => {
    expect([...STATUSES].sort()).toEqual(Object.keys(EXPECTED_TONE).sort());
  });

  it.each(STATUSES)('%s muestra su texto en es-PE y el tono esperado', (status) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    const tone = EXPECTED_TONE[status];

    expect(statusTone(status)).toBe(tone);
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(`>${messages.status[status]}</span>`);
    // El color sale de los tokens de la pastilla, nunca de un hex fijo.
    expect(html).toContain(`bg-status-${tone}-bg`);
    expect(html).toContain(`text-status-${tone}-fg`);
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('nunca es solo color: ningún estado tiene el texto vacío', () => {
    for (const status of STATUSES) {
      expect(messages.status[status].trim()).not.toBe('');
    }
  });
});
