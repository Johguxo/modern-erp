// E3-H4 · deriveTimeline: la línea de tiempo por estado, solo con las fechas del documento.
import { describe, expect, it } from 'vitest';

import {
  deriveTimeline,
  TIMELINE_KINDS,
  TIMELINE_STATES,
  type TimelineSource,
} from './request-timeline';
import { REQUEST_STATUSES, type RequestStatus } from './request-state-machine';

const REQUESTER = '11111111-1111-4111-8111-111111111111';
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
  ...overrides,
});

const shape = (items: ReturnType<typeof deriveTimeline>) =>
  items.map((entry) => `${entry.kind}:${entry.state}`);

describe('deriveTimeline', () => {
  it('borrador: creada y lo que falta', () => {
    expect(deriveTimeline(source('draft'))).toEqual([
      { kind: 'created', state: 'done', at: CREATED, actorId: REQUESTER },
      { kind: 'approval', state: 'upcoming', at: null, actorId: null },
      { kind: 'delivery', state: 'upcoming', at: null, actorId: null },
    ]);
  });

  it('en aprobación: la aprobación está pendiente', () => {
    const items = deriveTimeline(source('in_approval', { submittedAt: SUBMITTED }));
    expect(items).toEqual([
      { kind: 'created', state: 'done', at: CREATED, actorId: REQUESTER },
      { kind: 'submitted', state: 'done', at: SUBMITTED, actorId: REQUESTER },
      { kind: 'approval', state: 'pending', at: null, actorId: null },
      { kind: 'delivery', state: 'upcoming', at: null, actorId: null },
    ]);
  });

  it('cambios solicitados: la aprobación vuelve a ser próxima', () => {
    const items = deriveTimeline(source('changes_requested', { submittedAt: SUBMITTED }));
    expect(shape(items)).toEqual([
      'created:done',
      'submitted:done',
      'approval:upcoming',
      'delivery:upcoming',
    ]);
  });

  it('aprobada: solo la fecha, sin autor', () => {
    const items = deriveTimeline(
      source('approved', { submittedAt: SUBMITTED, approvedAt: APPROVED }),
    );
    expect(items.at(2)).toEqual({ kind: 'approved', state: 'done', at: APPROVED, actorId: null });
    expect(shape(items).slice(3)).toEqual(['delivery:upcoming']);
  });

  it('entregada: aprobada y entregada con sus fechas', () => {
    const items = deriveTimeline(
      source('delivered', { submittedAt: SUBMITTED, approvedAt: APPROVED, deliveredAt: DELIVERED }),
    );
    expect(items.slice(2)).toEqual([
      { kind: 'approved', state: 'done', at: APPROVED, actorId: null },
      { kind: 'delivery', state: 'done', at: DELIVERED, actorId: null },
    ]);
  });

  it('rechazada: termina ahí, con la fecha de cierre', () => {
    const items = deriveTimeline(source('rejected', { submittedAt: SUBMITTED, closedAt: CLOSED }));
    expect(shape(items)).toEqual(['created:done', 'submitted:done', 'rejected:stopped']);
    expect(items.at(-1)?.at).toBe(CLOSED);
  });

  it('anulada sin cierre registrado usa la última actualización', () => {
    const items = deriveTimeline(source('cancelled', { submittedAt: SUBMITTED }));
    expect(items.at(-1)).toEqual({
      kind: 'cancelled',
      state: 'stopped',
      at: UPDATED,
      actorId: null,
    });
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
