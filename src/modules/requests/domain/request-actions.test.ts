// E3-H4 · availableActions: tabla por estado y perfil (permisos tomados de ROLE_PERMISSIONS).
import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from '@/modules/identity';
import type { Permission, Role } from '@/shared/permissions';

import {
  availableActions,
  REQUEST_ACTIONS,
  type RequestAction,
  type ActionOptions,
} from './request-actions';
import { REQUEST_STATUSES, type RequestStatus } from './request-state-machine';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const viewer = (role: Role, userId: string) => ({
  userId,
  permissions: new Set<Permission>(ROLE_PERMISSIONS[role]),
});

const actionsOf = (
  status: RequestStatus,
  role: Role,
  userId: string,
  options: ActionOptions = { pendingForMe: false },
) => availableActions({ status, requesterId: OWNER }, viewer(role, userId), options);

describe('availableActions · solicitante dueño', () => {
  const table: [RequestStatus, RequestAction[]][] = [
    ['draft', ['edit_draft', 'cancel', 'download_pdf']],
    ['in_approval', ['cancel', 'download_pdf']],
    ['changes_requested', ['edit_draft', 'resubmit', 'cancel', 'download_pdf']],
    ['approved', ['download_pdf']],
    ['delivered', ['download_pdf']],
    ['rejected', ['download_pdf']],
    ['cancelled', ['download_pdf']],
  ];
  it.each(table)('%s', (status, expected) => {
    expect(actionsOf(status, 'requester', OWNER)).toEqual(expected);
  });

  it('la tabla cubre todos los estados', () => {
    expect(table.map(([status]) => status).sort()).toEqual([...REQUEST_STATUSES].sort());
  });
});

describe('availableActions · almacén que no es el dueño', () => {
  const table: [RequestStatus, RequestAction[]][] = [
    ['draft', ['download_pdf']],
    ['in_approval', ['correct_line', 'download_pdf']],
    ['changes_requested', ['download_pdf']],
    ['approved', ['correct_line', 'deliver', 'download_pdf']],
    ['delivered', ['download_pdf']],
    ['rejected', ['download_pdf']],
    ['cancelled', ['download_pdf']],
  ];
  it.each(table)('%s', (status, expected) => {
    expect(actionsOf(status, 'warehouse', OTHER)).toEqual(expected);
  });
});

describe('availableActions · decisión de aprobación', () => {
  it('con el paso pendiente suyo, el aprobador decide', () => {
    expect(actionsOf('in_approval', 'approver', OTHER, { pendingForMe: true })).toEqual([
      'approve',
      'request_changes',
      'reject',
      'download_pdf',
    ]);
  });

  it('sin el paso pendiente suyo, no decide', () => {
    expect(actionsOf('in_approval', 'approver', OTHER)).toEqual(['download_pdf']);
  });

  it('quien no tiene approvals.decide no decide aunque el paso sea suyo', () => {
    expect(actionsOf('in_approval', 'requester', OTHER, { pendingForMe: true })).toEqual([
      'download_pdf',
    ]);
  });

  it('el dueño nunca decide su propio documento', () => {
    expect(actionsOf('in_approval', 'warehouse', OWNER, { pendingForMe: true })).toEqual([
      'cancel',
      'correct_line',
      'download_pdf',
    ]);
  });

  it('en un estado donde no se puede decidir no aparecen las acciones', () => {
    for (const status of ['approved', 'draft', 'rejected'] as const) {
      const actions = actionsOf(status, 'approver', OTHER, { pendingForMe: true });
      expect(actions).not.toContain('approve');
      expect(actions).not.toContain('reject');
      expect(actions).not.toContain('request_changes');
    }
  });
});

describe('availableActions · administrador (todos los permisos)', () => {
  it('no dueño, con paso pendiente suyo, en aprobación', () => {
    expect(actionsOf('in_approval', 'admin', OTHER, { pendingForMe: true })).toEqual([
      'cancel',
      'approve',
      'request_changes',
      'reject',
      'correct_line',
      'download_pdf',
    ]);
  });

  it('no dueño en borrador ajeno: solo el PDF', () => {
    expect(actionsOf('draft', 'admin', OTHER)).toEqual(['download_pdf']);
  });

  it('dueño en borrador', () => {
    expect(actionsOf('draft', 'admin', OWNER)).toEqual(['edit_draft', 'cancel', 'download_pdf']);
  });
});

describe('availableActions · invariantes', () => {
  it('solo devuelve acciones conocidas, sin repetidas y siempre con el PDF', () => {
    const roles = Object.keys(ROLE_PERMISSIONS) as Role[];
    for (const status of REQUEST_STATUSES) {
      for (const role of roles) {
        for (const userId of [OWNER, OTHER]) {
          for (const pendingForMe of [false, true]) {
            const actions = actionsOf(status, role, userId, { pendingForMe });
            expect(new Set(actions).size).toBe(actions.length);
            expect(actions).toContain('download_pdf');
            for (const action of actions) expect(REQUEST_ACTIONS).toContain(action);
          }
        }
      }
    }
  });

  it('editar es solo del dueño', () => {
    for (const status of REQUEST_STATUSES) {
      const actions = actionsOf(status, 'admin', OTHER, { pendingForMe: true });
      expect(actions).not.toContain('edit_draft');
    }
  });

  it('anular: el dueño hasta antes de aprobar; cancel_any en lo enviado, nunca un borrador ajeno', () => {
    const cancellable = (status: RequestStatus, role: Role, userId: string) =>
      actionsOf(status, role, userId).includes('cancel');
    for (const status of REQUEST_STATUSES) {
      const ownerCan = ['draft', 'in_approval', 'changes_requested'].includes(status);
      expect(cancellable(status, 'requester', OWNER)).toBe(ownerCan);
      const adminCan = ['in_approval', 'changes_requested', 'approved'].includes(status);
      expect(cancellable(status, 'admin', OTHER)).toBe(adminCan);
      expect(cancellable(status, 'warehouse', OTHER)).toBe(false);
      expect(cancellable(status, 'approver', OTHER)).toBe(false);
    }
  });

  it('el dueño sin requests.create (aprobador) no anula', () => {
    expect(actionsOf('in_approval', 'approver', OWNER)).not.toContain('cancel');
  });

  it('el dueño con almacén anula en aprobación pero no tras aprobar', () => {
    expect(actionsOf('in_approval', 'warehouse', OWNER)).toContain('cancel');
    expect(actionsOf('approved', 'warehouse', OWNER)).not.toContain('cancel');
  });

  it('editar exige requests.create: el aprobador dueño de un borrador no edita', () => {
    expect(actionsOf('draft', 'approver', OWNER)).toEqual(['download_pdf']);
  });
});
