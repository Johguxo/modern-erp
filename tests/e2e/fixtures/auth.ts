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

export interface SeedLine {
  /** FIL-1, PER-2 o SIN-3 (el precio sale del catálogo; SIN-3 cuesta 0). */
  readonly productCode: string;
  readonly quantity: string;
  /** Código del equipo (EQ-1, EQ-2) o null. */
  readonly equipmentCode?: string | null;
}

export interface SeedRequest {
  readonly requesterId: string;
  readonly status:
    'draft' | 'in_approval' | 'changes_requested' | 'approved' | 'rejected' | 'cancelled';
  /** Obligatorio salvo en borradores y en borradores anulados (`cancelled` sin número). */
  readonly number?: string;
  /** Solo `cancelled`: quién anuló y su comentario (E3-H5). */
  readonly closedById?: string;
  readonly closeComment?: string;
  readonly reason?: string;
  /** Código del equipo (EQ-1, EQ-2) o null. Por defecto, sin equipo. */
  readonly equipmentCode?: string | null;
  readonly totalAmount?: string;
  readonly updatedAt?: Date;
  /** Líneas activas (numeradas desde 1) con precios y subtotales del catálogo. */
  readonly lines?: readonly SeedLine[];
}

export interface Accounts {
  create(variant: AccountVariant): Promise<Account>;
  /** E1-H3: usuario con cuenta de Auth y membresía activa en un tenant ya creado. */
  addMember(tenantId: string, roles: readonly string[]): Promise<Account>;
  /**
   * E1-H3: correo de una cuenta que crea la app (al aceptar una invitación). `cleanup` borra su
   * fila de users, sus membresías y su cuenta de Auth.
   */
  trackEmail(email: string): void;
  /** E1-H4: tenant que crea la app (consola): `cleanup` lo busca por slug y lo borra. */
  trackTenantSlug(slug: string): void;
  /** E2-H2: producto activo (unidad UND, sin precio) en un tenant ya creado. */
  addProduct(tenantId: string, code: string, name: string): Promise<void>;
  /**
   * E3-H2: catálogo para crear SOF en un tenant ya creado (moneda PEN): almacén PRINCIPAL;
   * productos FIL-1 (12.5000), PER-2 (3.3333) y SIN-3 (sin precio); equipos EQ-1 y EQ-2; y el
   * centro de costo CC-1.
   */
  addRequestCatalog(tenantId: string): Promise<void>;
  /**
   * E3-H3: solicitudes sembradas con SQL en un tenant con `addRequestCatalog` (sin pasar por la
   * app). Un borrador no lleva número; lo demás sí. `updatedAt` por defecto es ahora. Devuelve los
   * ids en el mismo orden que `rows`.
   */
  addRequests(tenantId: string, rows: readonly SeedRequest[]): Promise<string[]>;
  /** E1-H3: fija `max_users` en los overrides de la suscripción del tenant (null = el del plan). */
  setMaxUsers(tenantId: string, max: number | null): Promise<void>;
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
  const trackedEmails: string[] = [];
  const trackedSlugs: string[] = [];

  async function authAccount(): Promise<Omit<Account, 'tenants'>> {
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
    return { email, password, authUserId, userId: user.id };
  }

  async function tenant(name: string, status: 'active' | 'suspended') {
    const slug = `e2e-${shortId()}`;
    const [row] = await sql<{ id: string }[]>`
      insert into tenants (name, slug, status) values (${name}, ${slug}, ${status}) returning id`;
    if (!row) throw new Error('tenant no creado');
    tenantIds.push(row.id);
    await sql`insert into tenant_settings (tenant_id) values (${row.id})`;
    await sql`insert into document_sequences (tenant_id, doc_type, prefix, next_number) values (${row.id}, 'SOF', 'SOF-', 1)`;
    await sql`
      insert into subscriptions (tenant_id, plan_id, status)
      select ${row.id}, id, 'active' from plans where code = 'starter'`;
    return { id: row.id, name };
  }

  return {
    async create(variant) {
      const account = await authAccount();
      const tag = shortId();
      const user = { id: account.userId };

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
      return { ...account, tenants };
    },

    async addMember(tenantId, roles) {
      const account = await authAccount();
      await sql`
        insert into memberships (tenant_id, user_id, roles, status)
        values (${tenantId}, ${account.userId}, ${[...roles]}, 'active')`;
      const [row] = await sql<{ name: string }[]>`select name from tenants where id = ${tenantId}`;
      return { ...account, tenants: [{ id: tenantId, name: row?.name ?? '' }] };
    },

    trackTenantSlug(slug) {
      trackedSlugs.push(slug);
    },

    trackEmail(email) {
      trackedEmails.push(email.toLowerCase());
    },

    async setMaxUsers(tenantId, max) {
      const overrides = max === null ? {} : { max_users: max };
      await sql`
        update subscriptions set overrides = ${sql.json(overrides)}
        where tenant_id = ${tenantId} and status <> 'cancelled'`;
    },

    async addProduct(tenantId, code, name) {
      await sql`
        insert into products (tenant_id, code, name, unit)
        values (${tenantId}, ${code}, ${name}, 'UND')`;
    },

    async addRequestCatalog(tenantId) {
      await sql`
        insert into warehouses (tenant_id, code, name, is_default)
        values (${tenantId}, 'PRINCIPAL', 'Almacén principal', true)`;
      await sql`
        insert into products (tenant_id, code, name, unit, reference_price, currency) values
          (${tenantId}, 'FIL-1', 'Filtro de aceite', 'UND', '12.5000', 'PEN'),
          (${tenantId}, 'PER-2', 'Perno', 'UND', '3.3333', 'PEN')`;
      await sql`
        insert into products (tenant_id, code, name, unit)
        values (${tenantId}, 'SIN-3', 'Producto sin precio', 'UND')`;
      await sql`
        insert into equipment (tenant_id, code, name) values
          (${tenantId}, 'EQ-1', 'Grúa'), (${tenantId}, 'EQ-2', 'Montacargas')`;
      await sql`
        insert into cost_centers (tenant_id, code, name)
        values (${tenantId}, 'CC-1', 'Obra norte')`;
    },

    async addRequests(tenantId, rows) {
      const [warehouse] = await sql<{ id: string }[]>`
        select id from warehouses where tenant_id = ${tenantId} and is_default`;
      const [costCenter] = await sql<{ id: string }[]>`
        select id from cost_centers where tenant_id = ${tenantId} and code = 'CC-1'`;
      if (!warehouse || !costCenter) throw new Error('falta addRequestCatalog');
      const ids: string[] = [];
      for (const row of rows) {
        // Sin número ni envío: un borrador o un borrador anulado (nunca enviado).
        const draft = row.status === 'draft' || (row.status === 'cancelled' && !row.number);
        const cancelled = row.status === 'cancelled';
        const updatedAt = row.updatedAt ?? new Date();
        const [equipment] = row.equipmentCode
          ? await sql<{ id: string }[]>`
              select id from equipment where tenant_id = ${tenantId} and code = ${row.equipmentCode}`
          : [];
        const [inserted] = await sql<{ id: string }[]>`
          insert into requests (
            tenant_id, number, status, requester_id, cost_center_id, warehouse_id, equipment_id,
            reason, currency, total_amount, submitted_at, approved_at, closed_at, closed_by,
            close_comment, created_at, updated_at
          ) values (
            ${tenantId}, ${draft ? null : (row.number ?? null)}, ${row.status}, ${row.requesterId},
            ${costCenter.id}, ${warehouse.id}, ${equipment?.id ?? null},
            ${row.reason ?? 'Mantenimiento'}, 'PEN', ${row.totalAmount ?? '100.00'},
            ${draft ? null : updatedAt}, ${row.status === 'approved' ? updatedAt : null},
            ${cancelled ? updatedAt : null}, ${cancelled ? (row.closedById ?? null) : null},
            ${cancelled ? (row.closeComment ?? null) : null}, ${updatedAt}, ${updatedAt}
          ) returning id`;
        if (!inserted) throw new Error('solicitud no creada');
        ids.push(inserted.id);
        let lineNo = 0;
        for (const line of row.lines ?? []) {
          lineNo += 1;
          const [lineEquipment] = line.equipmentCode
            ? await sql<{ id: string }[]>`
                select id from equipment
                where tenant_id = ${tenantId} and code = ${line.equipmentCode}`
            : [];
          await sql`
            insert into request_lines (
              tenant_id, request_id, line_no, product_id, product_code_snapshot,
              description_snapshot, unit_snapshot, equipment_id, quantity, unit_price, subtotal
            )
            select ${tenantId}, ${inserted.id}, ${lineNo}, p.id, p.code, p.name, p.unit,
              ${lineEquipment?.id ?? null}, ${line.quantity}::numeric,
              coalesce(p.reference_price, 0), round(${line.quantity}::numeric * coalesce(p.reference_price, 0), 2)
            from products p
            where p.tenant_id = ${tenantId} and p.code = ${line.productCode}`;
        }
      }
      return ids;
    },

    async cleanup() {
      try {
        if (trackedSlugs.length > 0) {
          const created = await sql<{ id: string }[]>`
            select id from tenants where slug in ${sql(trackedSlugs)}`;
          for (const row of created) if (!tenantIds.includes(row.id)) tenantIds.push(row.id);
        }
        if (trackedEmails.length > 0) {
          const created = await sql<{ id: string; auth_user_id: string | null }[]>`
            select id, auth_user_id from users where email in ${sql(trackedEmails)}`;
          for (const row of created) {
            if (!userIds.includes(row.id)) userIds.push(row.id);
            if (row.auth_user_id && !authUserIds.includes(row.auth_user_id)) {
              authUserIds.push(row.auth_user_id);
            }
          }
        }
        if (tenantIds.length > 0) {
          await sql`delete from audit_events where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from invitations where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from request_line_revisions where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from request_lines where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from requests where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from document_sequences where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from products where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from equipment where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from cost_centers where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from import_jobs where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from warehouses where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from memberships where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from subscriptions where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from tenant_settings where tenant_id in ${sql(tenantIds)}`;
          await sql`delete from audit_events where tenant_id in ${sql(tenantIds)}`;
        }
        if (userIds.length > 0) {
          await sql`delete from audit_events where actor_user_id in ${sql(userIds)}`;
          await sql`delete from invitations where invited_by in ${sql(userIds)}`;
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
        trackedEmails.length = 0;
        trackedSlugs.length = 0;
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
