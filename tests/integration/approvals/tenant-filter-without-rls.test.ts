// E4-H4 · Primera defensa: el repositorio de instancias de aprobación filtra por tenantId por sí
// solo. Se crea con getDbAdmin() (rol dueño, sin RLS): si se quita un eq(tenantId) de la consulta,
// estas pruebas fallan porque ya no hay RLS que tape el error.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { approvalInstances } from '@/db/schema';
import { createDrizzleInstanceRepository } from '@/modules/approvals/infrastructure/drizzle-instance-repository';

import {
  decideAs,
  seedApprovalWorld,
  sendRequest,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: ApprovalWorld;
let B: ApprovalWorld;
let instanceB = '';

const repo = () => createDrizzleInstanceRepository(getDbAdmin());

beforeAll(async () => {
  A = await seedApprovalWorld(fx);
  B = await seedApprovalWorld(fx);
  // El SOF de B queda aprobado (sus dos pasos firmados), con su instancia en `approved`.
  let view = await sendRequest(B.world);
  for (const [index, member] of [B.ana, B.luis].entries()) {
    const step = (await storedSteps(view.id))[index];
    if (!step) throw new Error('sin paso');
    view = {
      ...view,
      ...(await decideAs(member, {
        id: view.id,
        version: view.version,
        stepId: step.id,
        decision: 'approve',
      })),
    };
  }
  const instance = (await storedInstances(view.id))[0];
  if (!instance || instance.status !== 'approved') throw new Error('instancia no aprobada');
  instanceB = instance.id;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('el repositorio de instancias filtra por tenantId sin RLS', () => {
  it('reopenInstance con el tenant de A no reabre la instancia de B', async () => {
    expect(await repo().reopenInstance(A.world.tenantId, instanceB, new Date())).toBe(false);
    const [stored] = await getDbAdmin()
      .select()
      .from(approvalInstances)
      .where(eq(approvalInstances.id, instanceB));
    expect(stored?.status).toBe('approved');
  });

  it('reopenInstance con el tenant correcto sí la reabre', async () => {
    expect(await repo().reopenInstance(B.world.tenantId, instanceB, new Date())).toBe(true);
  });

  it('settingsOf no devuelve la política de otro tenant', async () => {
    expect(await repo().settingsOf(A.world.tenantId, instanceB)).toBeNull();
    expect(await repo().settingsOf(B.world.tenantId, instanceB)).not.toBeNull();
  });
});
