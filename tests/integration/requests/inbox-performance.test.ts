// E3-H3 · Rendimiento de la bandeja: 5,000 solicitudes en un tenant (insertadas con SQL, respetando
// los checks de número/estado/envío). `listRequests` completo (permiso, asignaciones, consulta de
// página, conteos y nombres, dentro de withTenant) debe tardar menos de 1 s en los 5 casos del
// plan. Hay un calentamiento antes de medir. E7-H1 lo vuelve a comprobar con el seed --load.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import type { ApprovalAssignments, ListRequestsInput } from '@/modules/requests';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  fakeAssignments,
  runInbox,
  seedRequestsWorld,
  type Member,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const TOTAL = 5000;
const LIMIT_MS = 1000;

const fx = createIdentityFixtures();
let world: RequestsWorld;
let reader: Member;
let colleague: Member;
let approver: Member;
let pending: string[];
const timings: { name: string; ms: number }[] = [];

beforeAll(async () => {
  world = await seedRequestsWorld(fx);
  reader = await addMember(fx, world, {
    fullName: 'Lector Total',
    permissions: ['requests.read_own', 'requests.read_all'],
    roles: ['approver'],
  });
  colleague = await addMember(fx, world, { fullName: 'Colega' });
  approver = await addMember(fx, world, {
    fullName: 'Aprobador',
    permissions: ['requests.read_own', 'approvals.decide'],
    roles: ['approver'],
  });

  // 5,000 solicitudes repartidas entre tres solicitantes y seis estados; un 1/6 son borradores.
  // updated_at distribuido en ~100 días; los enviados tienen número y submitted_at.
  await getDbAdmin().execute(sql`
    insert into requests (
      tenant_id, doc_type, number, status, requester_id, cost_center_id, warehouse_id,
      equipment_id, reason, currency, total_amount, submitted_at, approved_at, created_at, updated_at
    )
    select
      ${world.tenantId}::uuid,
      'SOF',
      case when s.status = 'draft' then null else 'PERF-' || lpad(g::text, 5, '0') end,
      s.status,
      (array[${world.userId}::uuid, ${colleague.userId}::uuid, ${reader.userId}::uuid])[1 + g % 3],
      ${world.costCenterId}::uuid,
      ${world.warehouseId}::uuid,
      case when g % 2 = 0 then ${world.equipmentId}::uuid else null end,
      'Solicitud de carga ' || g || case when g % 7 = 0 then ' filtro de aceite' else '' end,
      'PEN',
      (g % 997) + 0.5,
      case when s.status = 'draft' then null else ts end,
      case when s.status = 'approved' then ts else null end,
      ts,
      ts
    from generate_series(1, ${TOTAL}) as g
    cross join lateral (
      select
        (array['draft','in_approval','approved','rejected','delivered','changes_requested'])[1 + g % 6] as status,
        timestamptz '2026-08-01 00:00:00+00' + (g * interval '28 minutes') as ts
    ) as s
  `);

  const rows = await getDbAdmin().execute<{ id: string }>(sql`
    select id from requests
    where tenant_id = ${world.tenantId}::uuid and status = 'in_approval'
    order by updated_at desc limit 200
  `);
  pending = [...rows].map((row) => row.id);
}, 120_000);

afterAll(async () => {
  const worst = Math.max(0, ...timings.map((t) => t.ms));
  process.stdout.write(
    `
[E3-H3 rendimiento · ${TOTAL} solicitudes] ${timings
      .map((t) => `${t.name}: ${t.ms.toFixed(0)} ms`)
      .join(' · ')} · máx ${worst.toFixed(0)} ms
`,
  );
  await fx.cleanup();
  await closeDatabases();
}, 120_000);

interface Case {
  readonly name: string;
  readonly who: () => Member['ctx'];
  readonly input: Partial<ListRequestsInput>;
  readonly assignments?: () => ApprovalAssignments;
  readonly expectTotal?: (total: number) => boolean;
}

const CASES: Case[] = [
  {
    name: 'todas (read_all)',
    who: () => reader.ctx,
    input: {},
    expectTotal: (total) => total > 4000,
  },
  {
    name: 'todas (solo lo propio)',
    who: () => world.ctx,
    input: {},
    expectTotal: (total) => total > 1000,
  },
  {
    name: 'en aprobación, página profunda',
    who: () => reader.ctx,
    input: { tab: 'in_approval', page: 30 },
    expectTotal: (total) => total > 500,
  },
  {
    name: 'esperan mi aprobación (200 pendientes)',
    who: () => approver.ctx,
    input: { tab: 'awaiting_me' },
    assignments: () => fakeAssignments(pending, pending),
    expectTotal: (total) => total > 0,
  },
  {
    name: 'búsqueda por motivo',
    who: () => reader.ctx,
    input: { q: 'filtro aceite' },
    expectTotal: (total) => total > 100,
  },
];

describe(`bandeja con ${TOTAL} solicitudes: listRequests completo < ${LIMIT_MS} ms`, () => {
  it('el volumen insertado es el esperado', async () => {
    const out = await runInbox(reader.ctx);
    // read_all ve todo menos los borradores ajenos (1/6) y conserva los propios.
    expect(out.total).toBeGreaterThan(TOTAL * 0.8);
    expect(out.items).toHaveLength(25);
    expect(pending).toHaveLength(200);
  });

  it.each(CASES)('$name', async ({ name, who, input, assignments, expectTotal }) => {
    const extras = assignments ? { assignments: assignments() } : {};
    // Calentamiento: planes, conexión y cachés.
    await runInbox(who(), input, extras);
    await runInbox(who(), input, extras);

    const started = performance.now();
    const out = await runInbox(who(), input, extras);
    const elapsed = performance.now() - started;
    timings.push({ name, ms: elapsed });

    expect(expectTotal?.(out.total) ?? true).toBe(true);
    expect(out.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(LIMIT_MS);
  });
});
