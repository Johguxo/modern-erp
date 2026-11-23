# E0 · Fundaciones del proyecto

Objetivo: un repositorio que compila, prueba y despliega, con la estructura de ADR-001 y el estilo del prototipo, antes de escribir lógica de negocio.

### E0-H1 · Proyecto base
**Como** equipo **quiero** el proyecto Next.js inicial con las herramientas acordadas **para** empezar a construir sobre una base estable.

**Criterios de aceptación**
- [x] Next.js (App Router) + TypeScript estricto (`strict`, `noUncheckedIndexedAccess`) con pnpm.
- [x] Estructura de carpetas exacta de ADR-001 (`src/app`, `src/modules/*/{domain,application,infrastructure,contracts}`, `src/shared`, `src/db`, `src/ui`, `src/worker.ts`, `src/env.ts`) con un `index.ts` por módulo.
- [x] Scripts: `dev`, `build`, `start`, `worker`, `lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `format`.
- [x] ESLint + Prettier configurados, con la **regla de imports prohibidos** de ADR-003 (`no-restricted-imports` por carpeta) y una prueba que demuestre que falla al violarla.
- [x] `src/env.ts` valida variables con Zod y falla al arrancar si falta alguna; `.env.example` completo.

Estado: en revisión · Issue: [#3](https://github.com/Johguxo/modern-erp/issues/3)

### E0-H2 · Base de datos local y Drizzle
**Criterios de aceptación**
- [x] Supabase CLI configurado (`supabase/config.toml`); `supabase start` levanta Postgres, Auth y Storage locales.
- [x] Drizzle configurado con dos conexiones: `db` (rol `app_user`, para la web) y `dbAdmin` (rol dueño, para migraciones y worker). Se exponen como `getDb()` y `getDbAdmin()`, perezosas (ADR-004).
- [x] Migración inicial: extensiones (`pgcrypto`, `pg_trgm`), rol `app_user` y helper `withTenant(ctx, fn)` que abre una transacción con `set local app.tenant_id`.
- [x] Prueba de integración que verifica que `app_user` sin `app.tenant_id` no ve filas de una tabla con RLS.

Estado: en revisión · Issue: [#4](https://github.com/Johguxo/modern-erp/issues/4)

### E0-H3 · Núcleo compartido
**Criterios de aceptación**
- [x] `src/shared/context.ts`: tipo `Ctx { tenantId, userId, roles, permissions, locale, timezone, requestId }`.
- [x] `src/shared/errors.ts`: `DomainError` y subclases (`NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `InvalidTransitionError`, `LimitExceededError`), con su mapeo a respuestas HTTP y mensajes de interfaz.
- [x] Puertos en `src/shared/ports/`: `AuthProvider`, `Mailer`, `FileStorage`, `JobQueue`, `Clock`, `IdGenerator`.
- [x] Helper de server actions `action(contract, permission, handler)` que valida la entrada con Zod, arma el `ctx`, revisa el permiso y traduce errores. Igual para route handlers en `api/v1`.
- [x] Logger estructurado (pino) con `requestId`.

Estado: en revisión · Issue: [#5](https://github.com/Johguxo/modern-erp/issues/5)

### E0-H4 · Sistema visual y layouts
**Criterios de aceptación**
- [x] Tokens de `docs/ui/design-tokens.md` como variables CSS + tema de Tailwind; fuentes Inter y Space Grotesk con `next/font`.
- [x] Componentes shadcn listados instalados en `src/ui/components`.
- [x] Layout `(app)` con el menú lateral del prototipo (`Main.dc.html`), responsive (en el celular, barra superior con `sheet`).
- [x] Layout `(auth)` y layout `admin`.
- [x] Componentes base: `StatusBadge` (texto + color), `EmptyState`, `ErrorState`, `PageHeader`, `DataTable` (TanStack), `MoneyText` (formato es-PE), `DateText` (zona del tenant).
- [x] Archivo de mensajes `src/ui/messages/es-PE.ts`.

Estado: en revisión · Issue: [#6](https://github.com/Johguxo/modern-erp/issues/6)

### E0-H5 · CI y worker
**Criterios de aceptación**
- [ ] GitHub Actions: lint, typecheck, test, build en cada PR; pruebas de integración con Supabase local en CI.
- [ ] `src/worker.ts` arranca pg-boss, registra colas vacías y se apaga limpio con SIGTERM.
- [ ] Adaptador `JobQueue` sobre pg-boss con una prueba de encolar y procesar.

Estado: pendiente · Issue: [#7](https://github.com/Johguxo/modern-erp/issues/7)
