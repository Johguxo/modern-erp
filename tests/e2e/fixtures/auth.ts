// E1-H2 · Fixture de cuentas para E2E: crea el usuario en Supabase Auth (API admin, service role
// local) y sus filas (users, tenants, tenant_settings, suscripción starter, membresías,
// platform_admins) con la conexión dueño local. Lee las claves de process.env (nunca de archivos)
// y `cleanup` borra todo al terminar cada prueba, incluido el usuario de Auth.
import { randomUUID } from 'node:crypto';

import { test as base, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

import { messages } from '../../../src/ui/messages/es-PE';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name} para las E2E de login: expórtala en el comando (ver supabase status -o env).`,
    );
  }
  return value;
}

export type AccountVariant =
  /** Una membresía activa en un tenant activo. */
  | 'single'
  /** Dos membresías activas. */
  | 'multi'
  /** SuperAdmin sin membresías. */
  | 'superadmin'
  /** Usuario de plataforma sin membresías ni SuperAdmin. */
  | 'no_access'
  /** Una membresía en un tenant suspendido. */
  | 'suspended';

export interface Account {
  readonly email: string;
  readonly password: string;
  readonly authUserId: string;
  readonly userId: string;
  readonly tenants: readonly { readonly id: string; readonly name: string }[];
}

export interface Accounts {
  create(variant: AccountVariant): Promise<Account>;
  cleanup(): Promise<void>;
}

const shortId = () => randomUUID().replaceAll('-', '').slice(0, 10);

/** El fixture crea y borra cuentas: solo contra Supabase local, nunca un entorno real. */
function assertLocal(name: string): string {
  const value = requiredEnv(name);
  const { hostname } = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
    throw new Error(`${name} debe apuntar a Supabase local (127.0.0.1), no a ${hostname}.`);
  }
  return value;
}

export function createAccounts(): Accounts {
  const sql = postgres(assertLocal('DATABASE_URL_ADMIN'), { max: 2, onnotice: () => undefined });
  const admin = createClient(
    assertLocal('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const authUserIds: string[] = [];
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  async function tenant(name: string, status: 'active' | 'suspended') {
    const slug = `e2e-${shortId()}`;
    const [row] = await sql<{ id: string }[]>`
      insert into tenants (name, slug, status) values (${name}, ${slug}, ${status}) returning id`;
    if (!row) throw new Error('tenant no creado');
    tenantIds.push(row.id);
    await sql`insert into tenant_settings (tenant_id) values (${row.id})`;
    await sql`
      insert into subscriptions (tenant_id, plan_id, status)
      select ${row.id}, id, 'active' from plans where code = 'starter'`;
    return { id: row.id, name };
  }

  return {
    async create(variant) {
      const tag = shortId();
      const email = `e2e-${tag}@test.linkus.pe`;
      const password = `Clave-${tag}-segura`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(`No se pudo crear el usuario de Auth: ${error.message}`);
      const authUserId = data.user.id;
      authUserIds.push(authUserId);

      const [user] = await sql<{ id: string }[]>`
        insert into users (email, full_name, status, auth_user_id)
        values (${email}, ${`E2E ${tag}`}, 'active', ${authUserId}) returning id`;
      if (!user) throw new Error('user no creado');
      userIds.push(user.id);

      const tenants: { id: string; name: string }[] = [];
      if (variant === 'single') tenants.push(await tenant(`E2E Alfa ${tag}`, 'active'));
      if (variant === 'multi') {
        tenants.push(await tenant(`E2E Alfa ${tag}`, 'active'));
        tenants.push(await tenant(`E2E Beta ${tag}`, 'active'));
      }
      if (variant === 'suspended') tenants.push(await tenant(`E2E Pausa ${tag}`, 'suspended'));
      for (const t of tenants) {
        await sql`
          insert into memberships (tenant_id, user_id, roles, status)
          values (${t.id}, ${user.id}, ${['admin']}, 'active')`;
      }
      if (variant === 'superadmin') {
        await sql`insert into platform_admins (user_id) values (${user.id})`;
      }
      return { email, password, authUserId, userId: user.id, tenants };
    },

    async cleanup() {
      try {
        if (tenantIds.length > 0) {
          await sql`delete from memberships where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from subscriptions where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from tenant_settings where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from audit_events where tenant_id in ${sql(tenantIds)}`;
        }
        if (userIds.length > 0) {
          await sql`delete from platform_admins where user_id in ${sql(userIds)}`;
          await sql`delete from memberships where user_id in ${sql(userIds)}`;
          await sql`delete from users where id in ${sql(userIds)}`;
        }
        if (tenantIds.length > 0) await sql`delete from tenants where id in ${sql(tenantIds)}`;
        for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
      } finally {
        tenantIds.length = 0;
        userIds.length = 0;
        authUserIds.length = 0;
        await sql.end();
      }
    },
  };
}

/** Inicia sesión por la pantalla /login (selectores accesibles). */
export async function signInThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(messages.auth.email).fill(email);
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole('button', { name: messages.auth.signInSubmit }).click();
}

/** Inicia sesión y espera a que la app deje /login. */
export async function signIn(page: Page, account: Account, landing: RegExp): Promise<void> {
  await signInThroughUi(page, account.email, account.password);
  await expect(page).toHaveURL(landing);
}

export const test = base.extend<{ accounts: Accounts }>({
  // Playwright exige desestructurar el primer argumento aunque no use otras fixtures.
  // eslint-disable-next-line no-empty-pattern
  accounts: async ({}, provide) => {
    const accounts = createAccounts();
    await provide(accounts);
    await accounts.cleanup();
  },
});

export { expect };
