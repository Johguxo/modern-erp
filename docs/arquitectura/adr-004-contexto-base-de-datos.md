# ADR-004 – Contexto de base de datos (tenant y usuario) y roles de conexión

**Fecha:** 23 nov 2026 · **Estado:** aceptada

## Contexto
ADR-001 exige filtrar por tenant en cada repositorio y deja RLS como segunda defensa. Faltaba fijar cómo llega el contexto a Postgres, qué roles se conectan y cómo se tratan los flujos que ocurren antes de elegir empresa (login, `/elegir-empresa`, aceptar invitación).

## Decisión
1. **Dos conexiones** (`src/db`): `getDb()` con el rol `app_user` (web; sin `bypassrls`, no es dueño de tablas ni puede crearlas) y `getDbAdmin()` con el rol dueño (`postgres`; migraciones, worker y casos de uso acotados). Driver `postgres` (postgres-js) con `prepare: false`, compatible con el pooler de Supabase en modo transacción. Conexiones perezosas y únicas por proceso (`next build` compila sin `.env.local`).
2. **Contexto por transacción:** `withTenant(ctx, fn)` abre una transacción y ejecuta `select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`: parámetros, nunca interpolación; `true` lo limita a la transacción. `fn` recibe la transacción; los repositorios la usan **y además** filtran por `ctx.tenantId`.
3. **Sin tenant:** `withUser(ctx, fn)` fija solo `app.user_id`, para flujos previos a elegir empresa (listar mis membresías, leer mi usuario). Las políticas de `users` y `memberships` (E1) permiten leer las filas del propio `app.user_id`.
4. **Funciones de contexto:** las políticas no leen `current_setting` directo sino `app.current_tenant_id()` y `app.current_user_id()`, que devuelven `null` si el valor falta o es `''` (una conexión reutilizada del pool devuelve `''` tras un `set local`, y `''::uuid` lanzaría error). Se usan como `(select app.current_tenant_id())` para evaluarlas una vez por consulta.
5. **Plantilla de política:**
   ```sql
   alter table <t> enable row level security;
   create policy tenant_isolation on <t> for all to app_user
     using (tenant_id = (select app.current_tenant_id()))
     with check (tenant_id = (select app.current_tenant_id()));
   ```
   Toda política lleva `to app_user`. Tablas solo-insert (`approval_events`, `audit_events`, `stock_movements`): `revoke update, delete on <t> from app_user` y políticas solo `for select` y `for insert`.
6. **Permisos:** la migración inicial da a `app_user` `select, insert, update, delete` por defecto en las tablas futuras de `public` creadas por el rol que migra, y quita los privilegios por defecto de `anon`, `authenticated` y `service_role`: no usamos la Data API de Supabase (PostgREST/GraphQL).
7. **Credenciales de `app_user`:** la migración crea el rol sin login. En local, `supabase/seed/local-roles.sql` le da login con la contraseña de `.env.example`. En producción, el operador ejecuta una vez `alter role app_user with login password '<secreto>'` y la guarda solo en las variables de Railway.
8. **`getDbAdmin()` en la web:** prohibido salvo en casos de uso acotados y auditados en `audit_events`: aceptar invitación (E1-H3) y operaciones de plataforma del SuperAdmin (E1-H4). Nunca desde `src/app` directamente (regla de ESLint).
9. **Worker:** usa `getDbAdmin()` y aun así pasa `tenantId` a cada caso de uso, y los repositorios filtran.
10. **Capas:** `domain/`, `application/`, `contracts/` y `src/ui` no importan `drizzle-orm`, `postgres` ni `@/db`; los repositorios viven en `infrastructure/`. El driver `postgres` solo se importa en `src/db` (regla de ESLint).

## Consecuencias
- Toda tabla nueva lleva su política en la misma migración y una prueba de aislamiento entre dos tenants.
- No se anidan `withTenant`/`withUser`; un request de escritura = una transacción.
- `supabase db reset` borra lo migrado por drizzle-kit: por eso `pnpm db:reset` encadena `pnpm db:migrate`. La única fuente de migraciones es `src/db/migrations`.
- Al iniciar sesión, `users.id` y las membresías se obtienen a partir de `auth_user_id` con **una lectura acotada con `getDbAdmin()`** dentro del `CtxResolver` (E1-H2), un caso puntual del §8. Se descartó una función `security definer`: es más simple y queda en un solo lugar del código.
- En producción, `DATABASE_URL` va por el pooler en modo transacción (puerto 6543, usuario `app_user.<project_ref>`); `DATABASE_URL_ADMIN`, directo o en modo sesión (5432).
