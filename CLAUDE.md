# LinkUs · Plataforma de Compras y Almacén

SaaS multi-cliente para que empresas medianas en Perú gestionen solicitudes de almacén (SOF), compras y aprobaciones sin Excel. Primer cliente: **Genrent**. Estamos construyendo el **MVP** (solo SOF).

La plataforma la desarrolla **LinkUs** (empresa y marca de producto). Repositorio: `Johguxo/modern-erp`.

## Antes de cualquier tarea, lee lo que aplique

| Necesitas saber… | Lee |
|---|---|
| Qué entra y qué no en el MVP | `docs/producto/prd-mvp.md` |
| Arquitectura y reglas de capas | `docs/arquitectura/adr-001-monolito-modular.md` |
| Login, roles, permisos, planes, SuperAdmin | `docs/arquitectura/adr-002-identidad-roles-planes.md` |
| Stack y librerías permitidas | `docs/arquitectura/adr-003-stack.md` |
| Conexiones, `withTenant`/`withUser`, roles y plantilla de RLS | `docs/arquitectura/adr-004-contexto-base-de-datos.md` |
| `Ctx`, errores, `action()`/`route()`, mensajes y logs | `docs/arquitectura/adr-005-entrega-ctx-errores.md` |
| Login, sesión, empresa activa, `publicAction`, solo lectura | `docs/arquitectura/adr-006-sesion-empresa-activa.md` |
| Estados del SOF y motor de aprobaciones | `docs/dominio/flujo-sof-aprobaciones.md` |
| Tablas, columnas, RLS, seed | `docs/dominio/modelo-datos.md` |
| Pantallas, rutas y casos de uso | `docs/ui/mapa-pantallas.md` |
| Colores, tipografía, componentes | `docs/ui/design-tokens.md` |
| Cómo se ve cada pantalla | `docs/ui/prototipo/*.dc.html` (referencia, no código para copiar) |
| Qué historia toca y sus criterios | `docs/backlog/` |

Si los documentos se contradicen o falta una definición, **pregunta** antes de inventar. Si tomas una decisión nueva de arquitectura, propón una ADR en `docs/arquitectura/`.

## Stack
Next.js (App Router) · TypeScript estricto · pnpm · Tailwind + shadcn/ui · React Hook Form + Zod · TanStack Table · Drizzle ORM · PostgreSQL/Auth/Storage en Supabase · pg-boss (worker) · @react-pdf/renderer · Resend + React Email · Vitest · Playwright · Railway.

## Comandos
```
pnpm dev            # app en http://localhost:3000
pnpm worker         # proceso de jobs
pnpm exec supabase start   # Postgres, Auth, Storage y correo locales (requiere Docker; la CLI viene en devDependencies)
pnpm exec supabase status  # URLs y claves locales (`-o env` para copiarlas a .env.local)
pnpm exec supabase stop    # detener conservando los datos
pnpm db:generate    # generar migración desde el esquema Drizzle (`--custom --name=<slug>` para SQL a mano)
pnpm db:migrate     # aplicar migraciones (src/db/migrations)
pnpm db:reset       # recrear la base local: login local de app_user + migraciones
pnpm db:seed        # datos de demo (Genrent demo + Empresa prueba)
pnpm lint | pnpm typecheck | pnpm test | pnpm test:int | pnpm test:e2e | pnpm build | pnpm format
```
Las migraciones solo se crean con drizzle-kit; nunca `supabase migration` ni `supabase db push`. `pnpm test:int` necesita Supabase local levantado y migrado.

## Reglas no negociables
1. **Capas (ADR-001):** la lógica de negocio va en `src/modules/<módulo>/{domain,application}`. `src/app` solo valida con el contrato Zod, arma el `ctx` y llama al caso de uso.
2. **Imports:** en `src/modules` nunca `next/*` ni `react`. SDKs externos (`@supabase/*`, `resend`, `pg-boss`) solo en `infrastructure/` o `src/shared/adapters/`. Un módulo usa a otro solo por su `index.ts`.
3. **Multi-cliente:** todo caso de uso recibe `ctx`; todo repositorio filtra por `ctx.tenantId`; toda tabla nueva lleva `tenant_id`, índice y política RLS; toda historia que toca datos agrega una prueba de aislamiento entre dos tenants.
4. **Permisos, no roles:** revisa `ctx.permissions` (`ROLE_PERMISSIONS` en `identity/domain/permissions.ts`), nunca compares nombres de rol en la lógica.
5. **Dinero:** `numeric` en la BD y `decimal.js` en el dominio. Nunca `number` para montos.
6. **Fechas:** UTC en la BD; mostrar con la zona del tenant.
7. **Inmutables:** `approval_events`, `audit_events` y `stock_movements` solo reciben insert.
8. **Errores:** lanza subclases de `DomainError`; nunca muestres errores técnicos al usuario.
9. **Textos de UI** en español (es-PE) desde `src/ui/messages/es-PE.ts`. Código, nombres de variables, tablas y commits en inglés.
10. **Fuera de alcance:** no implementes lo que el PRD deja fuera del MVP, pero no cierres el diseño a ello (usa los campos reservados que ya existen).
11. **Secretos:** nunca leas ni escribas `.env.local` ni `.env.production`; usa `.env.example` como referencia.

## Skills externas (`.claude/skills/`, fijadas en `skills-lock.json`)
Son guías generales. **Si chocan con `docs/`, mandan los docs del proyecto.**
- **`frontend-design`:** en pantallas con prototipo manda la fidelidad a `docs/ui/prototipo/` y a `docs/ui/design-tokens.md`: no inventes paleta, fuentes ni layout. En pantallas sin prototipo (configuración, `/admin`), usa el lenguaje visual de la bandeja y los tokens existentes. Su libertad estética solo aplica a piezas nuevas sin referencia y con aprobación.
- **`supabase-postgres-best-practices`:** úsala para índices, consultas, locks y RLS, pero el modelo multi-cliente es el de `docs/dominio/modelo-datos.md` (rol `app_user` + `set local app.tenant_id`), no `auth.uid()`. Las migraciones van con drizzle-kit en `src/db/migrations`.
- **`web-design-guidelines`:** para revisar UI (accesibilidad, UX). Descarga sus reglas de GitHub en cada uso.
- **`codebase-design`:** vocabulario para diseñar módulos (módulo, interfaz, seam, adapter), coherente con ADR-001: los puertos de `src/shared/ports` son seams y los adaptadores viven en `infrastructure/`. Su "design it twice" lanza subagentes en paralelo: solo si se pide.
- **Plugin `modern-web-guidance`** (en `.claude/settings.json`): buenas prácticas web actuales.
- **Agregar o actualizar** skills siempre en una rama, revisando el diff del `SKILL.md` antes del PR: `npx skills add <repo> --skill <nombre> -a claude-code --copy -y` o `npx skills update -p`.

## Ramas y PRs (Git flow simplificado)
- **`main`:** lo que está en producción. Solo recibe PRs desde `develop` (release), que abre y aprueba el líder del proyecto con `/release`.
- **`develop`:** rama de integración. Todo el trabajo del equipo entra aquí primero.
- **Ramas de historia:** salen de `develop` actualizado y su PR va a `develop` (`gh pr create --base develop`). Nunca abras un PR de una historia contra `main`.
- **Correcciones urgentes en producción:** `fix/<slug>` desde `main`, PR a `main` y luego se sincroniza `main` → `develop`. Solo con aprobación del líder.
- **Merge:** squash al integrar una historia en `develop`; merge commit (sin squash) de `develop` a `main`, para conservar el historial.
- **Nunca hagas push directo a `main` ni a `develop`.** Antes de abrir un PR, actualiza tu rama con `develop` (`git fetch origin && git rebase origin/develop`).

## Cómo trabajar una historia
1. Usa `/historia <ID>` (por ejemplo, `/historia E0-H1`).
2. Toma su issue de GitHub (asígnatelo; si ya tiene assignee, es de otra persona). Una rama por historia, creada desde `develop`: `feat/<id>-<slug>` (por ejemplo, `feat/e3-h2-nuevo-sof`).
3. Primero el plan (subagente `arquitecto`), luego implementación con pruebas, luego revisión (subagente `revisor`).
4. Cumple la **Definición de hecha** de `docs/backlog/README.md`.
5. Actualiza la línea `Estado:` de la historia y el estado de la épica en `docs/backlog/README.md`.
6. Commits con Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) y PR a `develop` con `gh pr create --base develop`, con `Closes #N` del issue de la historia.

## Convenciones de código
- Archivos en `kebab-case`; componentes React en `PascalCase`.
- Casos de uso: una función por archivo en `application/` (`submit-request.ts`) con firma `(ctx, input, deps) => Promise<Output>`.
- Contratos: `contracts/<caso>.ts` con `inputSchema` y `outputSchema` Zod; los tipos se infieren.
- Repositorios: interfaz en `domain/` o `application/ports.ts`, implementación Drizzle en `infrastructure/`.
- Componentes de servidor por defecto; `"use client"` solo donde haya interacción.
- Sin `any`. Sin `console.log` (usa el logger).
