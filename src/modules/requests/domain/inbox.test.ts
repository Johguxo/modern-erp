import { describe, expect, it } from 'vitest';

import type { Permission } from '@/shared/permissions';

import {
  INBOX_TABS,
  MORE_TABS,
  TAB_STATUS,
  VISIBLE_TABS,
  displayStatus,
  inboxScope,
  isAwaitingMe,
  isOwnDraft,
} from './inbox';
import { REQUEST_STATUSES } from './request-state-machine';

const viewer = (userId: string, permissions: Permission[] = []) => ({
  userId,
  permissions: new Set(permissions),
});

describe('pestañas', () => {
  it('cuatro visibles y dos en «Más», sin repetir', () => {
    expect(VISIBLE_TABS).toEqual(['all', 'awaiting_me', 'in_approval', 'approved']);
    expect(MORE_TABS).toEqual(['draft', 'rejected']);
    expect(new Set(INBOX_TABS).size).toBe(6);
  });

  it('«Aprobadas» es solo approved; cada pestaña de estado usa un estado válido', () => {
    expect(TAB_STATUS.approved).toBe('approved');
    for (const status of Object.values(TAB_STATUS)) {
      expect(REQUEST_STATUSES).toContain(status);
    }
  });
});

describe('displayStatus', () => {
  it('muestra «Espera mi aprobación» solo en aprobación y con el paso pendiente mío', () => {
    expect(displayStatus('in_approval', true)).toBe('awaiting_my_approval');
    expect(displayStatus('in_approval', false)).toBe('in_approval');
    expect(displayStatus('approved', true)).toBe('approved');
    expect(displayStatus('draft', true)).toBe('draft');
  });
});

describe('inboxScope', () => {
  it('lleva el usuario, si lee todo y los asignados', () => {
    expect(inboxScope(viewer('u1', ['requests.read_all']), ['r1'])).toEqual({
      viewerId: 'u1',
      readAll: true,
      assignedIds: ['r1'],
    });
    expect(inboxScope(viewer('u1', ['requests.read_own']), [])).toEqual({
      viewerId: 'u1',
      readAll: false,
      assignedIds: [],
    });
  });
});

describe('isAwaitingMe', () => {
  const request = { id: 'r1', status: 'in_approval' as const, requesterId: 'u2' };

  it('exige paso pendiente mío, en aprobación y que no sea mía', () => {
    expect(isAwaitingMe(request, 'u1', new Set(['r1']))).toBe(true);
    expect(isAwaitingMe(request, 'u1', new Set())).toBe(false);
    expect(isAwaitingMe({ ...request, requesterId: 'u1' }, 'u1', new Set(['r1']))).toBe(false);
    expect(isAwaitingMe({ ...request, status: 'approved' }, 'u1', new Set(['r1']))).toBe(false);
  });
});

describe('isOwnDraft', () => {
  it('solo un borrador del propio usuario', () => {
    expect(isOwnDraft({ status: 'draft', requesterId: 'u1' }, 'u1')).toBe(true);
    expect(isOwnDraft({ status: 'draft', requesterId: 'u2' }, 'u1')).toBe(false);
    expect(isOwnDraft({ status: 'in_approval', requesterId: 'u1' }, 'u1')).toBe(false);
  });
});
