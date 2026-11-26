# Modelo de datos

**Versión:** 1.0 · **Fecha:** 19 nov 2026 · **Motor:** PostgreSQL (Supabase) · **ORM:** Drizzle

## Convenciones

- Nombres de tablas y columnas en inglés, `snake_case`, plural para tablas.
- `id uuid primary key default gen_random_uuid()` en toda tabla (salvo las indicadas).
- `created_at timestamptz not null default now()` y `updated_at timestamptz` donde haya edición.
- **Toda tabla de negocio tiene `tenant_id uuid not null references tenants(id)`** e índice que empieza por `tenant_id`.
- Montos: `numeric(14,2)`; cantidades: `numeric(14,3)`; precios unitarios: `numeric(14,4)`.
- Estados como `text` con `check (...)`, no enums de Postgres (más fáciles de extender con una migración).
- Datos flexibles y configuración en `jsonb`, siempre validados con Zod en el código.
- Borrado lógico (`active boolean` o `status`) en maestros; nunca se borran documentos ni eventos.
- Tablas de eventos y auditoría: solo `insert` (sin `update` ni `delete`, reforzado con RLS).

## Módulo `identity`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `plans` | `code` (unique), `name`, `max_users` int null, `max_warehouses` int null, `storage_mb` int, `features` text[], `active` | Global (sin tenant). Seed: `starter`, `business`, `enterprise` |
| `tenants` | `name`, `slug` (unique), `status` (`active`,`suspended`,`cancelled`) | |
| `subscriptions` | `tenant_id`, `plan_id`, `status` (`trial`,`active`,`past_due`,`suspended`,`cancelled`), `starts_at`, `ends_at`, `price_amount` numeric(14,2), `price_currency`, `overrides` jsonb | Una **vigente** (no cancelada) por tenant (índice parcial unique) |
| `tenant_settings` | `tenant_id` (PK), `brand` jsonb, `currency` (`PEN`), `timezone` (`America/Lima`), `locale` (`es-PE`), `login_methods` text[], `email_domains` text[], `notification_channels` text[], `role_labels` jsonb, `inventory` jsonb, `integrations` jsonb | |
| `users` | `auth_user_id` uuid unique, `email` (unique, en minúsculas), `full_name`, `phone`, `status` (`active`,`disabled`) | Identidad propia, separada de Supabase Auth |
| `memberships` | `tenant_id`, `user_id`, `roles` text[], `status` (`active`,`disabled`) | unique(`tenant_id`,`user_id`) |
| `invitations` | `tenant_id`, `email`, `roles` text[], `token_hash`, `expires_at`, `accepted_at`, `invited_by` | El token en claro solo viaja en el correo |
| `platform_admins` | `user_id` (PK), `created_at` | SuperAdmins de LinkUs |
| `audit_events` | `tenant_id` null, `actor_user_id`, `actor_type` (`user`,`platform_admin`,`system`,`external`), `action`, `entity_type`, `entity_id`, `data` jsonb, `ip`, `user_agent` | Solo insert. Índice (`tenant_id`, `created_at desc`) |

## Módulo `catalog`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `warehouses` | `tenant_id`, `code`, `name`, `is_default` bool, `active` | MVP: uno por defecto por tenant. Código inmutable y normalizado (mayúsculas, sin espacios, ≤ 40, `^[A-Z0-9][A-Z0-9._/-]*$`); sin DELETE (se desactiva con `active`). De solo lectura para `app_user`: el almacén por defecto lo crea el alta del tenant |
| `products` | `tenant_id`, `code`, `name`, `unit`, `category`, `reference_price` numeric(14,4), `currency`, `active` | unique(`tenant_id`,`code`); índice de búsqueda `pg_trgm` sobre `code` y `name`. Código inmutable y normalizado (mayúsculas, sin espacios, ≤ 40, `^[A-Z0-9][A-Z0-9._/-]*$`); sin DELETE (se desactiva con `active`) |
| `equipment` | `tenant_id`, `code`, `name`, `type`, `active` | unique(`tenant_id`,`code`) — ej. `GEN-045`. Código inmutable y normalizado (mayúsculas, sin espacios, ≤ 40, `^[A-Z0-9][A-Z0-9._/-]*$`); sin DELETE (se desactiva con `active`) |
| `cost_centers` | `tenant_id`, `code`, `name`, `active` | unique(`tenant_id`,`code`). Código inmutable y normalizado (mayúsculas, sin espacios, ≤ 40, `^[A-Z0-9][A-Z0-9._/-]*$`); sin DELETE (se desactiva con `active`) |
| `import_jobs` | `tenant_id`, `kind` (`products`,`equipment`,`stock`), `status`, `file_path`, `payload` jsonb, `summary` jsonb, `errors` jsonb, `created_by`, `finished_at` | Resultado fila por fila de importaciones. `payload` guarda las filas leídas (sin validar) hasta que el worker termina y luego se vacía; no se usa Storage (`file_path` queda reservado). `app_user` puede hacer UPDATE solo de `status, summary, errors, payload, finished_at, updated_at` (0009), para que el worker cierre el job en la misma transacción `withTenant` del upsert (E2-H3) |

## Módulo `requests`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `document_sequences` | PK(`tenant_id`,`doc_type`), `prefix` (incluye el separador, p. ej. `SOF-`), `next_number` int, `padding` int, `last_issued_number` int null | Bloqueo `FOR UPDATE` al numerar (tras bloquear la solicitud). `next_number > coalesce(last_issued_number, 0)` con check y trigger (0012): no se reabren números emitidos. `app_user` sin INSERT/DELETE; la fila la crea el alta del tenant o el backfill (E3-H1) |
| `requests` | `tenant_id`, `doc_type` (`SOF`; futuro `PR`,`PD`,`PO`), `number` text null, `status`, `requester_id`, `cost_center_id`, `warehouse_id`, `equipment_id` null (cabecera), `reason`, `currency`, `total_amount` numeric(14,2), `submitted_at`, `approved_at`, `delivered_at`, `closed_at`, `closed_by` null (FK `users`), `close_comment` text null, `version` int | unique(`tenant_id`,`doc_type`,`number`) cuando `number` no es null; índices (`tenant_id`,`status`,`updated_at desc`), (`tenant_id`,`requester_id`,`updated_at desc`) y (`tenant_id`,`updated_at desc`). Checks de coherencia número/estado/`submitted_at`. Sin DELETE (se anula); `tenant_id`, `requester_id`, `doc_type` y `currency` no se actualizan. Moneda única por solicitud (la del tenant al crearla). `close_comment`: nulo o no vacío y ≤ 500 (check); `app_user` puede actualizar `closed_by` y `close_comment` (0014). Sin número = solo lo ve su solicitante |
| `request_lines` | `tenant_id`, `request_id`, `line_no`, `product_id`, `description_snapshot`, `unit_snapshot`, `equipment_id`, `quantity` numeric(14,3), `unit_price` numeric(14,4), `subtotal` numeric(14,2), `notes`, `status` (`active`,`removed`), `revision` int, `needs_reconfirmation` bool | Guarda copia del código (`product_code_snapshot`), nombre y unidad del producto al guardar; el precio se toma del catálogo al guardar el borrador y queda congelado al enviar. DELETE solo si la solicitud está en `draft` (política RLS restrictiva); después se marca `removed` |
| `request_line_revisions` | `tenant_id`, `request_id`, `request_line_id`, `revision`, `snapshot` jsonb, `changed_by`, `changed_at`, `reason` | Historial de correcciones (E4-H4); solo insert |

## Módulo `approvals`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `approval_policies` | `tenant_id`, `doc_type`, `name`, `conditions` jsonb, `priority` int, `settings` jsonb (`reapproval_tolerance_pct`, `reminder_hours`), `active` | |
| `approval_policy_steps` | `tenant_id`, `policy_id`, `step_order`, `name`, `approver_type` (`users`,`role`,`requester_manager`,`external_email`), `approver_ref` jsonb, `rule` (`any`,`all`), `condition` jsonb | `approver_ref`: lista de user ids, código de rol o correos |
| `approval_instances` | `tenant_id`, `request_id` (unique), `policy_id`, `policy_snapshot` jsonb, `status` (`in_progress`,`approved`,`rejected`,`changes_requested`,`cancelled`) | |
| `approval_steps` | `tenant_id`, `instance_id`, `step_order`, `name`, `kind` (`normal`,`reconfirmation`), `rule`, `status` (`waiting`,`pending`,`approved`,`rejected`,`changes_requested`,`skipped`), `line_ids` uuid[] null, `pending_since`, `decided_by`, `decided_at`, `comment` | `line_ids` solo en pasos de reconfirmación |
| `approval_step_assignees` | `tenant_id`, `step_id`, `user_id` null, `external_email` null, `decision` (`approved`,`rejected`,`changes_requested`) null, `decided_at` | Para la regla `all` |
| `approval_events` | `tenant_id`, `request_id`, `step_id` null, `type`, `actor_user_id` null, `actor_type`, `data` jsonb | Solo insert. Fuente de la línea de tiempo |
| `external_approval_tokens` | `tenant_id`, `step_id`, `email`, `token_hash`, `expires_at`, `used_at` | **Reservada** para Hong Kong (fase 2); se crea en el MVP vacía |

## Módulo `inventory`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `stock_levels` | PK(`tenant_id`,`warehouse_id`,`product_id`), `quantity` numeric(14,3), `updated_at` | Saldo actual |
| `stock_movements` | `tenant_id`, `warehouse_id`, `product_id`, `type` (`initial`,`delivery_out`,`adjustment`,`receipt`), `quantity` (signo según tipo), `request_id` null, `request_line_id` null, `actor_user_id`, `note` | Solo insert. El saldo se actualiza en la misma transacción |

## Módulo `documents`

| Tabla | Columnas clave | Notas |
|---|---|---|
| `files` | `tenant_id`, `entity_type`, `entity_id`, `kind` (`pdf`,`attachment`,`import`), `storage_path`, `mime_type`, `size_bytes`, `created_by` | Ruta en Storage: `{tenant_id}/{entity_type}/{entity_id}/{file}` |

## Jobs
pg-boss crea su propio esquema (`pgboss`). Colas iniciales: `notifications.send-email`, `approvals.reminders` (programada cada hora), `documents.render-pdf`, `catalog.import`.

## Seguridad: RLS

- RLS **activado en todas las tablas** del esquema `public`.
- **Primera defensa:** todo repositorio filtra por `tenant_id` del `ctx` (obligatorio y probado).
- **Segunda defensa (RLS):** la app web se conecta con `app_user` (sin `bypassrls`, no es dueño de las tablas ni puede crearlas). Cada request de negocio corre dentro de `withTenant(ctx, fn)`, que fija `app.tenant_id` y `app.user_id` para esa transacción con `set_config(..., true)` parametrizado. Las políticas son `to app_user` y comparan `tenant_id = (select app.current_tenant_id())`; sin valor, la función devuelve `null` y la consulta no devuelve filas. Plantilla y convenciones en ADR-004.
- **Sin empresa elegida:** `withUser(ctx, fn)` fija solo `app.user_id`; `users` y `memberships` permiten leer las filas del propio `app.current_user_id()`.
- **Migraciones y worker** usan el rol dueño (`DATABASE_URL_ADMIN`), que no aplica RLS; el worker igual pasa el `tenantId` a cada caso de uso. Aceptar invitación y operaciones de SuperAdmin usan este rol solo en casos de uso acotados y auditados.
- Las tablas globales (`plans`, `users`, `platform_admins`) tienen políticas propias: lectura de `plans` para `app_user`; `users` solo la propia fila o las de usuarios con membresía en el tenant activo.
- Extensiones (`pgcrypto`, `pg_trgm`) en el esquema `extensions`; el `search_path` de `app_user` es `public, extensions`.
- Índices `pg_trgm` de `products` (`code`, `name`): sin `tenant_id`, aceptable en el MVP; con volumen, considerar `btree_gin` con (`tenant_id`, `name` `gin_trgm_ops`).
- Prueba de integración obligatoria: dos tenants con datos; cada repositorio debe devolver solo los del tenant del `ctx`.

## Diagrama de relaciones (resumen)

```
tenants ─┬─ subscriptions ── plans
         ├─ tenant_settings
         ├─ memberships ── users ── platform_admins
         ├─ products / equipment / cost_centers / warehouses
         ├─ requests ─┬─ request_lines ── request_line_revisions
         │            ├─ approval_instances ── approval_steps ── approval_step_assignees
         │            ├─ approval_events
         │            └─ files
         ├─ approval_policies ── approval_policy_steps
         ├─ stock_levels / stock_movements
         └─ audit_events
```

## Datos de referencia (migración)

- Planes `starter`, `business`, `enterprise` en `src/db/migrations/0003_seed_plans.sql` (producción también los necesita). Valores provisionales: `max_users` 10 / 30 / ilimitado, `max_warehouses` 1 / 3 / ilimitado, `storage_mb` 1024 / 5120 / 20480; el precio va en cada suscripción.

## Datos semilla (`pnpm db:seed`, solo demo)

- Tenant **"Genrent (demo)"** con plan `business`, almacén por defecto, centros de costo, 20 productos y 5 equipos de ejemplo (los del prototipo: `FLT-9009`, `ACE-1540`, `COR-3310`, `EMP-0712`, `GEN-045`…), política "SOF estándar" (Almacén → Gerencia local) y usuarios de prueba por rol.
- Tenant **"Empresa prueba"** para verificar el aislamiento.
- Un SuperAdmin cuyo correo viene de la variable `SEED_SUPERADMIN_EMAIL`.
