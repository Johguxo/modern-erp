# ADR-007 – Contexto de plataforma (consola SuperAdmin)

**Fecha:** 24 nov 2026 · **Estado:** aceptada

## Contexto
E1-H4 agrega la consola `/admin/clientes`: un SuperAdmin crea clientes y cambia su suscripción. Estas acciones no tienen tenant activo, así que no encajan en `action()` (ADR-005), que exige un `Ctx` de tenant y corre en `withTenant` con RLS. Faltaba definir con qué contexto, conexión y auditoría se ejecutan.

## Decisión
1. **La consola vive en `identity`** (`application/platform/`, contratos `platform-*.ts`), no en un módulo nuevo. `platform.*` es solo el nombre de las acciones. Tenants, planes, suscripciones e invitaciones ya son de `identity`.
2. **`PlatformCtx { userId, requestId }`** (`src/shared/context.ts`): el SuperAdmin, sin tenant ni permisos de tenant.
3. **`platformAction(contract, handler)`** (`src/app/_lib/platform-action.ts`, sobre `runPlatformPipeline`):
   - revisa la sesión: usuario de Auth validado, usuario activo y fila en `platform_admins`;
   - sin sesión → `UNAUTHENTICATED`; quien no es SuperAdmin → `FORBIDDEN` genérico;
   - valida con Zod, llama al caso de uso, valida la salida y corre `afterCommit`.
   - No abre transacción. Las páginas usan `requirePlatformAdmin()`, que da 404 a quien no es SuperAdmin y devuelve el `PlatformCtx`.
4. **Conexión dueño acotada** (ADR-004 §8):
   - los casos de uso abren su transacción con `getDbAdmin` a través de `createPlatformStore()` (`identity/infrastructure`); `src/app` nunca recibe la conexión;
   - toda consulta de un cliente filtra por su `tenantId` explícito;
   - **toda escritura vuelve a revisar `platform_admins` dentro de la transacción**;
   - los bloqueos siguen el orden de E1-H3: cupos (`seats:`) y luego filas.
5. **Auditoría:** cada escritura registra `audit_events` con `actor_type = 'platform_admin'`, el SuperAdmin como actor y el tenant afectado (`tenant_id` null solo en acciones globales, como el script del primer SuperAdmin, con `actor_type = 'system'`). Las lecturas no se auditan.
6. **Pasos de alta de un cliente:** `createTenant` corre, en su transacción, los `tenantSetupSteps` de `src/app/_lib/platform.ts`. Las historias que crean tablas por cliente agregan el suyo: almacén por defecto (E2-H1), secuencia SOF (E3-H1) y política "SOF estándar" (E4-H1). Así `identity` no depende de esos módulos.
7. **Primer SuperAdmin:** `pnpm admin:create-superadmin` (idempotente). Fuera de local exige `--allow-production` y pone una contraseña aleatoria que no se muestra.

## Consecuencias
- Toda consulta y escritura de la consola salta RLS: la seguridad depende de `requirePlatformAdmin`/`platformAction`, de la revisión dentro de la transacción y de los filtros por `tenantId`. Las reglas de ESLint impiden que `src/app` importe `@/db/admin`.
- `tenants.status` no se edita en el MVP (suspender o reactivar el cliente es "Después", ADR-002 §5). El modo solo lectura sale del estado de la suscripción.
- Desactivar un usuario en todas las empresas sigue pendiente (ADR-006, Consecuencias).
