// E1-H1 · Servicio Entitlements con un repositorio en memoria.
import { describe, expect, it } from 'vitest';

import { NotFoundError } from '@/shared/errors';

import type { EntitlementSnapshot, PlanLimits } from '../domain/entitlements';

import { createEntitlements } from './entitlements';
import type { EntitlementsRepository } from './ports';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '33333333-3333-4333-8333-333333333333';
const MISSING = '99999999-9999-4999-8999-999999999999';

const STARTER: PlanLimits = { maxUsers: 10, maxWarehouses: 1, storageMb: 1024, features: ['sof'] };

class InMemoryEntitlementsRepository implements EntitlementsRepository {
  readonly calls: string[] = [];

  constructor(private readonly snapshots: Map<string, EntitlementSnapshot>) {}

  loadSnapshot(tenantId: string): Promise<EntitlementSnapshot> {
    this.calls.push(tenantId);
    const found = this.snapshots.get(tenantId);
    if (!found)
      return Promise.reject(new NotFoundError({ message: `Tenant not found: ${tenantId}` }));
    return Promise.resolve(found);
  }
}

function setup() {
  const repo = new InMemoryEntitlementsRepository(
    new Map<string, EntitlementSnapshot>([
      [
        TENANT_A,
        {
          tenantStatus: 'active',
          subscription: { status: 'active', plan: STARTER, overrides: {} },
          seatsUsed: 10,
        },
      ],
      [
        TENANT_B,
        {
          tenantStatus: 'suspended',
          subscription: {
            status: 'active',
            plan: STARTER,
            overrides: { max_users: 40, features: ['sof', 'dashboard'] },
          },
          seatsUsed: 3,
        },
      ],
    ]),
  );
  return { repo, entitlements: createEntitlements({ repo }) };
}

describe('createEntitlements delega en el repositorio y en las reglas del dominio', () => {
  it('canAddUser usa la foto del tenant pedido (A en el límite → no permitido)', async () => {
    const { repo, entitlements } = setup();

    await expect(entitlements.canAddUser(TENANT_A)).resolves.toEqual({
      allowed: false,
      limit: 10,
      used: 10,
    });
    expect(repo.calls).toEqual([TENANT_A]);
  });

  it('canAddUser de B aplica sus overrides pero queda bloqueado por estar suspendido', async () => {
    const { entitlements } = setup();

    await expect(entitlements.canAddUser(TENANT_B)).resolves.toEqual({
      allowed: false,
      limit: null,
      used: 3,
    });
  });

  it('hasFeature usa los overrides de features', async () => {
    const { entitlements } = setup();

    await expect(entitlements.hasFeature(TENANT_A, 'dashboard')).resolves.toBe(false);
    await expect(entitlements.hasFeature(TENANT_B, 'dashboard')).resolves.toBe(true);
  });

  it('isReadOnly: A activo no, B suspendido sí', async () => {
    const { entitlements } = setup();

    await expect(entitlements.isReadOnly(TENANT_A)).resolves.toBe(false);
    await expect(entitlements.isReadOnly(TENANT_B)).resolves.toBe(true);
  });

  it('propaga el NotFoundError del repositorio si el tenant no existe', async () => {
    const { entitlements } = setup();

    await expect(entitlements.canAddUser(MISSING)).rejects.toBeInstanceOf(NotFoundError);
    await expect(entitlements.hasFeature(MISSING, 'sof')).rejects.toBeInstanceOf(NotFoundError);
    await expect(entitlements.isReadOnly(MISSING)).rejects.toBeInstanceOf(NotFoundError);
  });
});
