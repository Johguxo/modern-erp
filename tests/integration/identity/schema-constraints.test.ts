// E1-H1 · Restricciones del esquema de identity: checks (23514) y únicos (23505), con getDbAdmin()
// para probar la base y no RLS.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { invitations } from '@/db/schema';

import { expectPgError } from '../helpers/db';
import { createIdentityFixtures, randomEmail, randomSlug } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let tenantId: string;
let userId: string;

beforeAll(async () => {
  tenantId = (await fx.tenant()).id;
  userId = (await fx.user()).id;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('correos normalizados (23514)', () => {
  it.each([
    ['con mayúsculas', (e: string) => e.toUpperCase()],
    ['con espacios', (e: string) => ` ${e} `],
  ])('users: correo %s → 23514', async (_name, transform) => {
    expect(await expectPgError(() => fx.user({ email: transform(randomEmail()) }))).toBe('23514');
  });

  it.each([
    ['con mayúsculas', (e: string) => e.toUpperCase()],
    ['con espacios', (e: string) => ` ${e}`],
  ])('invitations: correo %s → 23514', async (_name, transform) => {
    expect(
      await expectPgError(() => fx.invitation(tenantId, { email: transform(randomEmail()) })),
    ).toBe('23514');
  });

  it('users: correo duplicado → 23505', async () => {
    const email = randomEmail();
    await fx.user({ email });

    expect(await expectPgError(() => fx.user({ email }))).toBe('23505');
  });
});

describe('roles válidos (23514)', () => {
  it('membership con rol inexistente → 23514', async () => {
    const user = await fx.user();

    expect(await expectPgError(() => fx.membership(tenantId, user.id, { roles: ['root'] }))).toBe(
      '23514',
    );
  });

  it('membership con roles vacíos → 23514', async () => {
    const user = await fx.user();

    expect(await expectPgError(() => fx.membership(tenantId, user.id, { roles: [] }))).toBe(
      '23514',
    );
  });

  it('membership con un rol válido y otro inválido → 23514', async () => {
    const user = await fx.user();

    expect(
      await expectPgError(() =>
        fx.membership(tenantId, user.id, { roles: ['requester', 'superadmin'] }),
      ),
    ).toBe('23514');
  });

  it('invitation con rol inexistente o roles vacíos → 23514', async () => {
    expect(await expectPgError(() => fx.invitation(tenantId, { roles: ['root'] }))).toBe('23514');
    expect(await expectPgError(() => fx.invitation(tenantId, { roles: [] }))).toBe('23514');
  });

  it('membership con todos los roles válidos se crea', async () => {
    const user = await fx.user();

    await expect(
      fx.membership(tenantId, user.id, {
        roles: ['admin', 'requester', 'warehouse', 'approver', 'purchasing'],
      }),
    ).resolves.toHaveProperty('id');
  });
});

describe('slug del tenant (23514)', () => {
  it.each(['Genrent', 'gen rent', 'gen_rent', '-genrent', 'genrent-', 'gen--rent', ''])(
    'slug %j → 23514',
    async (slug) => {
      expect(await expectPgError(() => fx.tenant({ slug }))).toBe('23514');
    },
  );

  it('slug con minúsculas, números y guiones simples se acepta', async () => {
    const slug = `genrent-2-${randomSlug()}`;

    await expect(fx.tenant({ slug })).resolves.toMatchObject({ slug });
  });

  it('slug duplicado → 23505', async () => {
    const { slug } = await fx.tenant();

    expect(await expectPgError(() => fx.tenant({ slug }))).toBe('23505');
  });
});

describe('una sola suscripción vigente por tenant', () => {
  it('segunda suscripción vigente → 23505', async () => {
    const tenant = await fx.tenant();
    await fx.subscription(tenant.id, 'starter', { status: 'active' });

    expect(
      await expectPgError(() => fx.subscription(tenant.id, 'business', { status: 'trial' })),
    ).toBe('23505');
  });

  it('cancelada + nueva vigente sí se permite (y varias canceladas también)', async () => {
    const tenant = await fx.tenant();
    await fx.subscription(tenant.id, 'starter', { status: 'cancelled' });
    await fx.subscription(tenant.id, 'starter', { status: 'cancelled' });

    await expect(
      fx.subscription(tenant.id, 'business', { status: 'active' }),
    ).resolves.toHaveProperty('id');
  });

  it('estado de suscripción inválido → 23514', async () => {
    const tenant = await fx.tenant();

    expect(
      await expectPgError(() =>
        fx.subscription(tenant.id, 'starter', { status: 'paused' as 'active' }),
      ),
    ).toBe('23514');
  });
});

describe('membresías e invitaciones únicas', () => {
  it('membresía duplicada (mismo tenant y usuario) → 23505', async () => {
    const user = await fx.user();
    await fx.membership(tenantId, user.id);

    expect(await expectPgError(() => fx.membership(tenantId, user.id))).toBe('23505');
  });

  it('el mismo usuario sí puede tener membresía en otro tenant', async () => {
    const other = await fx.tenant();

    await expect(fx.membership(other.id, userId)).resolves.toHaveProperty('id');
  });

  it('segunda invitación pendiente al mismo correo y tenant → 23505; tras aceptar la primera, otra pendiente sí', async () => {
    const email = randomEmail();
    const first = await fx.invitation(tenantId, { email });

    expect(await expectPgError(() => fx.invitation(tenantId, { email }))).toBe('23505');

    await getDbAdmin()
      .update(invitations)
      .set({ acceptedAt: new Date('2026-01-15T15:00:00.000Z') })
      .where(eq(invitations.id, first.id));

    await expect(fx.invitation(tenantId, { email })).resolves.toHaveProperty('id');
  });

  it('el mismo correo puede tener invitación pendiente en otro tenant', async () => {
    const email = randomEmail();
    const other = await fx.tenant();
    await fx.invitation(tenantId, { email });

    await expect(fx.invitation(other.id, { email })).resolves.toHaveProperty('id');
  });
});
