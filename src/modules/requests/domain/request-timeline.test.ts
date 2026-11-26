// E3-H4 · deriveTimeline: la línea de tiempo por estado, solo con las fechas del documento.
import { describe, expect, it } from 'vitest';

import {
  buildTimeline,
  deriveTimeline,
  TIMELINE_KINDS,
  TIMELINE_STATES,
  type ApprovalTimelineEntry,
  type TimelineSource,
} from './request-timeline';
import { REQUEST_STATUSES, type RequestStatus } from './request-state-machine';

const REQUESTER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const CREATED = new Date('2026-11-20T10:00:00.000Z');
const SUBMITTED = new Date('2026-11-21T10:00:00.000Z');
const APPROVED = new Date('2026-11-22T10:00:00.000Z');
const DELIVERED = new Date('2026-11-23T10:00:00.000Z');
const CLOSED = new Date('2026-11-24T10:00:00.000Z');
const UPDATED = new Date('2026-11-25T10:00:00.000Z');

const source = (
  status: RequestStatus,
  overrides: Partial<TimelineSource> = {},
): TimelineSource => ({
  status,
  requesterId: REQUESTER,
  createdAt: CREATED,
  updatedAt: UPDATED,
  submittedAt: null,
  approvedAt: null,
  deliveredAt: null,
  closedAt: null,
  closedBy: null,
  closeComment: null,
  ...overrides,
});

/** Un ítem esperado: los campos del paso van vacíos en la línea derivada. */
const plain = (fields: {
  kind: string;
  state: string;
  at: Date | null;
  actorId: string | null;
  comment: string | null;
}) => ({ ...fields, stepName: null, rule: null, assigneeIds: [] });

const shape = (items: ReturnType<typeof deriveTimeline>) =>
  items.map((entry) => `${entry.kind}:${entry.state}`);

describe('deriveTimeline', () => {
  it('borrador: creada y lo que falta', () => {
    expect(deriveTimeline(source('draft'))).toEqual([
      plain({ kind: 'created', state: 'done', at: CREATED, actorId: REQUESTER, comment: null }),
      plain({ kind: 'approval', state: 'upcoming', at: null, actorId: null, comment: null }),
      plain({ kind: 'delivery', state: 'upcoming', at: null, actorId: null, comment: null }),
    ]);
  });

  it('en aprobación: la aprobación está pendiente', () => {
    const items = deriveTimeline(source('in_approval', { submittedAt: SUBMITTED }));
    expect(items).toEqual([
      plain({ kind: 'created', state: 'done', at: CREATED, actorId: REQUESTER, comment: null }),
      plain({ kind: 'submitted', state: 'done', at: SUBMITTED, actorId: REQUESTER, comment: null }),
      plain({ kind: 'approval', state: 'pending', at: null, actorId: null, comment: null }),
      plain({ kind: 'delivery', state: 'upcoming', at: null, actorId: null, comment: null }),
    ]);
  });

  it('cambios solicitados: se detiene ahí y la aprobación vuelve a ser próxima', () => {
    const items = deriveTimeline(source('changes_requested', { submittedAt: SUBMITTED }));
    expect(items.at(2)).toEqual(
      plain({
        kind: 'changes_requested',
        state: 'stopped',
        at: UPDATED,
        actorId: null,
        comment: null,
      }),
    );
    expect(shape(items)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped',
      'approval:upcoming',
      'delivery:upcoming',
    ]);
  });

  it('aprobada: solo la fecha, sin autor', () => {
    const items = deriveTimeline(
      source('approved', { submittedAt: SUBMITTED, approvedAt: APPROVED }),
    );
    expect(items.at(2)).toEqual(
      plain({
        kind: 'approved',
        state: 'done',
        at: APPROVED,
        actorId: null,
        comment: null,
      }),
    );
    expect(shape(items).slice(3)).toEqual(['delivery:upcoming']);
  });

  it('entregada: aprobada y entregada con sus fechas', () => {
    const items = deriveTimeline(
      source('delivered', { submittedAt: SUBMITTED, approvedAt: APPROVED, deliveredAt: DELIVERED }),
    );
    expect(items.slice(2)).toEqual([
      plain({ kind: 'approved', state: 'done', at: APPROVED, actorId: null, comment: null }),
      plain({ kind: 'delivery', state: 'done', at: DELIVERED, actorId: null, comment: null }),
    ]);
  });

  it('rechazada: termina ahí, con la fecha de cierre', () => {
    const items = deriveTimeline(source('rejected', { submittedAt: SUBMITTED, closedAt: CLOSED }));
    expect(shape(items)).toEqual(['created:done', 'submitted:done', 'rejected:stopped']);
    expect(items.at(-1)?.at).toBe(CLOSED);
  });

  it('anulada sin cierre registrado usa la última actualización', () => {
    const items = deriveTimeline(source('cancelled', { submittedAt: SUBMITTED }));
    expect(items.at(-1)).toEqual(
      plain({
        kind: 'cancelled',
        state: 'stopped',
        at: UPDATED,
        actorId: null,
        comment: null,
      }),
    );
  });

  it('anulada: lleva quién anuló y su comentario', () => {
    const items = deriveTimeline(
      source('cancelled', {
        submittedAt: SUBMITTED,
        closedAt: CLOSED,
        closedBy: ADMIN,
        closeComment: 'Duplicada',
      }),
    );
    expect(items.at(-1)).toEqual(
      plain({
        kind: 'cancelled',
        state: 'stopped',
        at: CLOSED,
        actorId: ADMIN,
        comment: 'Duplicada',
      }),
    );
  });

  it('un borrador anulado nunca enviado no muestra «enviada»', () => {
    expect(shape(deriveTimeline(source('cancelled')))).toEqual([
      'created:done',
      'cancelled:stopped',
    ]);
  });

  it('siempre empieza por «creada» y usa solo tipos y estados conocidos', () => {
    for (const status of REQUEST_STATUSES) {
      const items = deriveTimeline(source(status, { submittedAt: SUBMITTED }));
      expect(items[0]?.kind).toBe('created');
      for (const entry of items) {
        expect(TIMELINE_KINDS).toContain(entry.kind);
        expect(TIMELINE_STATES).toContain(entry.state);
      }
    }
  });
});

describe('buildTimeline', () => {
  const entry = (
    kind: ApprovalTimelineEntry['kind'],
    overrides: Partial<Omit<ApprovalTimelineEntry, 'kind'>> = {},
  ): ApprovalTimelineEntry => ({
    kind,
    at: SUBMITTED,
    actorId: null,
    comment: null,
    stepName: null,
    rule: null,
    assigneeIds: [],
    ...overrides,
  });
  const base = (status: RequestStatus) => ({
    status,
    requesterId: REQUESTER,
    createdAt: CREATED,
    deliveredAt: null,
  });

  it('en aprobación: creada, hechos, el pendiente, los que esperan y la entrega próxima', () => {
    const items = buildTimeline(base('in_approval'), [
      entry('submitted', { actorId: REQUESTER }),
      entry('step_approved', { actorId: ADMIN, stepName: 'Almacén', comment: 'Hay stock' }),
      entry('step_pending', { stepName: 'Gerencia', rule: 'all', assigneeIds: [ADMIN] }),
      entry('step_waiting', { at: null, stepName: 'Dirección', rule: 'any' }),
    ]);
    expect(shape(items)).toEqual([
      'created:done',
      'submitted:done',
      'step_approved:done',
      'approval:pending',
      'approval:upcoming',
      'delivery:upcoming',
    ]);
    expect(items[2]).toMatchObject({ stepName: 'Almacén', actorId: ADMIN, comment: 'Hay stock' });
    expect(items[3]).toMatchObject({ stepName: 'Gerencia', rule: 'all', assigneeIds: [ADMIN] });
    expect(items[4]).toMatchObject({ at: null, stepName: 'Dirección' });
  });

  it('dos rondas: lo detenido queda como detenido y el reenvío sigue', () => {
    const items = buildTimeline(base('in_approval'), [
      entry('submitted'),
      entry('changes_requested', { actorId: ADMIN, comment: 'Falta el equipo' }),
      entry('resubmitted'),
      entry('step_pending', { stepName: 'Almacén', rule: 'any' }),
    ]);
    expect(shape(items)).toEqual([
      'created:done',
      'submitted:done',
      'changes_requested:stopped',
      'resubmitted:done',
      'approval:pending',
      'delivery:upcoming',
    ]);
  });

  it('con cambios pedidos la entrega sigue próxima; aprobada también', () => {
    expect(shape(buildTimeline(base('changes_requested'), [entry('changes_requested')]))).toEqual([
      'created:done',
      'changes_requested:stopped',
      'delivery:upcoming',
    ]);
    expect(shape(buildTimeline(base('approved'), [entry('approved')])).at(-1)).toBe(
      'delivery:upcoming',
    );
  });

  it('entregada: la entrega queda hecha con su fecha', () => {
    const items = buildTimeline({ ...base('delivered'), deliveredAt: DELIVERED }, [
      entry('approved'),
    ]);
    expect(items.at(-1)).toMatchObject({ kind: 'delivery', state: 'done', at: DELIVERED });
  });

  it('rechazada y anulada terminan sin entrega', () => {
    expect(
      shape(buildTimeline(base('rejected'), [entry('step_rejected', { comment: 'No' })])),
    ).toEqual(['created:done', 'rejected:stopped']);
    expect(
      shape(buildTimeline(base('cancelled'), [entry('submitted'), entry('cancelled')])),
    ).toEqual(['created:done', 'submitted:done', 'cancelled:stopped']);
  });
});
