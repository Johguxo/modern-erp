// E4-H3 · buildApprovalTimeline: eventos de todas las rondas más los pasos abiertos de la vigente.
import { describe, expect, it } from 'vitest';

import { buildApprovalTimeline, type OpenStepRow, type TimelineEventRow } from './timeline';

const ANA = '33333333-3333-4333-8333-333333333333';
const LUIS = '55555555-5555-4555-8555-555555555555';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 14, minute));

const event = (
  id: string,
  type: string,
  minute: number,
  overrides: Partial<TimelineEventRow> = {},
): TimelineEventRow => ({
  id,
  type,
  actorUserId: null,
  comment: null,
  createdAt: at(minute),
  stepName: null,
  stepRule: null,
  stepClosed: null,
  ...overrides,
});

const open = (order: number, overrides: Partial<OpenStepRow> = {}): OpenStepRow => ({
  order,
  name: `Paso ${order}`,
  rule: 'any',
  status: 'waiting',
  pendingSince: null,
  assigneeIds: [],
  ...overrides,
});

const shape = (entries: ReturnType<typeof buildApprovalTimeline>) =>
  entries.map((entry) => `${entry.kind}${entry.stepName ? `:${entry.stepName}` : ''}`);

describe('buildApprovalTimeline', () => {
  it('en curso: eventos, el paso pendiente con sus asignados y los que esperan', () => {
    const entries = buildApprovalTimeline({
      instanceStatus: 'in_progress',
      events: [
        event('e1', 'submitted', 0, { actorUserId: ANA }),
        event('e2', 'step_pending', 0),
        event('e3', 'step_approved', 5, {
          actorUserId: ANA,
          comment: 'Hay stock',
          stepName: 'Almacén',
          stepRule: 'any',
        }),
        event('e4', 'step_pending', 5),
      ],
      openSteps: [
        open(3, { name: 'Gerencia general' }),
        open(2, {
          name: 'Gerencia local',
          status: 'pending',
          pendingSince: at(5),
          assigneeIds: [LUIS],
        }),
      ],
    });
    expect(shape(entries)).toEqual([
      'submitted',
      'step_approved:Almacén',
      'step_pending:Gerencia local',
      'step_waiting:Gerencia general',
    ]);
    expect(entries[1]).toMatchObject({ actorId: ANA, comment: 'Hay stock', at: at(5) });
    expect(entries[2]).toMatchObject({ at: at(5), assigneeIds: [LUIS], rule: 'any' });
    expect(entries[3]).toMatchObject({ at: null, assigneeIds: [] });
  });

  it('una firma que no cierra el paso es parcial; sin stepClosed se trata como cerrada', () => {
    const entries = buildApprovalTimeline({
      instanceStatus: 'in_progress',
      events: [
        event('e1', 'step_approved', 1, {
          stepName: 'Almacén',
          stepRule: 'all',
          stepClosed: false,
        }),
        event('e2', 'step_approved', 2, { stepName: 'Almacén', stepRule: 'all', stepClosed: true }),
        event('e3', 'step_approved', 3, { stepName: 'Almacén', stepRule: 'all' }),
      ],
      openSteps: [],
    });
    expect(entries.map((entry) => entry.kind)).toEqual([
      'step_signed',
      'step_approved',
      'step_approved',
    ]);
  });

  it('ordena por fecha y desempata por id; conserva las rondas anteriores', () => {
    const entries = buildApprovalTimeline({
      instanceStatus: 'rejected',
      events: [
        event('b', 'step_rejected', 10, { stepName: 'Almacén', comment: 'No' }),
        event('a', 'resubmitted', 10),
        event('z', 'changes_requested', 5, { comment: 'Falta el equipo' }),
        event('y', 'submitted', 0),
      ],
      openSteps: [open(1, { status: 'pending', assigneeIds: [ANA] })],
    });
    expect(shape(entries)).toEqual([
      'submitted',
      'changes_requested',
      'resubmitted',
      'step_rejected:Almacén',
    ]);
  });

  it('una ronda cerrada no agrega pasos abiertos', () => {
    for (const status of ['approved', 'rejected', 'changes_requested', 'cancelled'] as const) {
      const entries = buildApprovalTimeline({
        instanceStatus: status,
        events: [event('e1', 'submitted', 0)],
        openSteps: [open(1, { status: 'pending' })],
      });
      expect(shape(entries)).toEqual(['submitted']);
    }
  });

  it('ignora step_pending y los tipos desconocidos', () => {
    const entries = buildApprovalTimeline({
      instanceStatus: 'approved',
      events: [
        event('e1', 'step_pending', 0),
        event('e2', 'line_corrected', 1),
        event('e3', 'approved', 2),
      ],
      openSteps: [],
    });
    expect(shape(entries)).toEqual(['approved']);
  });

  it('el paso pendiente sin asignados con usuario queda con la lista vacía', () => {
    const [entry] = buildApprovalTimeline({
      instanceStatus: 'in_progress',
      events: [],
      openSteps: [open(1, { status: 'pending', pendingSince: at(0) })],
    });
    expect(entry).toMatchObject({ kind: 'step_pending', assigneeIds: [] });
  });
});
