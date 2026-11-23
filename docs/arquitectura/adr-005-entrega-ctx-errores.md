# ADR-005 – Entrega: ctx, errores y helpers action()/route()

**Fecha:** 23 nov 2026 · **Estado:** aceptada

## Contexto
ADR-001 dice que `src/app` solo valida, arma el `ctx` y llama al caso de uso. Faltaba definir cómo: forma del `ctx`, errores, resultado de las server actions, transacción por request y logs.

## Decisión
1. **`Ctx`** (`src/shared/context.ts`): `tenantId`, `userId`, `roles`, `permissions` (Set), `locale`, `timezone`, `requestId`. Los tipos `Role` y `Permission` viven en `src/shared/permissions.ts`, porque `shared` no puede depender de un módulo. El mapa rol → permisos sigue en `identity/domain/permissions.ts` (ADR-002).
2. **Errores** (`src/shared/errors.ts`): `DomainError` y sus subclases, cada una con un código y un HTTP: NotFound 404 (también para recursos de otro tenant), Forbidden 403, Unauthenticated 401, Validation 422, Conflict 409, InvalidTransition 409 y LimitExceeded 403. Cualquier otro error termina en 500. `Error.message` es interno; el usuario ve el texto de `es-PE.ts` según el `code` y un `reason` opcional. Los errores se detectan con `isDomainError` (una marca), no con `instanceof`.
3. **`action(contract, permission | null, handler)`** y **`route(...)`** (`src/app/_lib`) comparten un núcleo: requestId → ctx (`CtxResolver` inyectable; el real llega en E1-H2) → permiso → validación Zod → **una transacción `withTenant` por request** → `outputSchema.parse` → `ActionResult`. El handler recibe `{ ctx, input, tx, shared }` y arma las dependencias del módulo con una fábrica exportada desde su `index.ts`. Los casos de uso mantienen la firma `(ctx, input, deps)` y vuelven a revisar el permiso con `requirePermission`.
4. **Resultado:** `ActionResult<T> = { ok: true, data } | { ok: false, error: { code, message, fieldErrors?, requestId } }`. `fieldErrors` usa rutas con punto (`lines.0.quantity`), como React Hook Form. `api/v1` responde `{ data }` o `{ error }`, con las cabeceras `x-request-id` y `no-store`, y en los métodos que modifican datos exige que `Origin` sea el de `APP_URL` (CSRF).
5. **Mensajes de validación:** un mapa global de Zod en es-PE (`src/ui/messages/zod-error-map.ts`). Los contratos no llevan textos.
6. **Logs:** puerto `Logger` y adaptador pino (JSON a stdout, sin transports), con `requestId`, `tenantId` y `userId` en cada línea. Se redactan contraseñas, tokens, `authorization` y `cookie`, y nunca se registran los parámetros de las consultas SQL ni el input de una validación fallida. `pino` solo se importa en `src/shared/adapters`.
7. **Errores de Postgres** (por ejemplo, 23505) se traducen en los repositorios con `isUniqueViolation`, nunca en `action()`.
8. **Montos** en las salidas: como `string` decimal (las server actions no serializan `Decimal`).

## Consecuencias
- No se llama a `redirect()` ni `notFound()` dentro del handler: corren dentro de la transacción y la revierten. El handler devuelve el resultado, y el cliente o la página redirigen según `ok`. La salida se valida dentro de la transacción, así que un error de contrato también revierte.
- `z.config` es global al proceso: los esquemas sin mensaje propio (incluido `env.ts`) muestran el texto en es-PE. En el cliente se activa con `configureZodMessages()` en el primer formulario (E1-H2).
- Sin el `CtxResolver` de E1-H2, toda acción responde `UNAUTHENTICATED`.
- Quedan para más adelante: el modo solo lectura (E1, con `Entitlements`), los permisos "uno de varios", la IP y el navegador para `audit_events` (E1-H3) y un actor `system` para los jobs sin usuario (E0-H5 o E4).
