# ADR-001 – Monolito modular en Next.js, preparado para separar el backend

**Fecha:** 18 nov 2026 · **Estado:** aceptada

## Decisión
Una sola app Next.js (App Router, TypeScript) con frontend y backend, organizada como **monolito modular**: la lógica de negocio vive en módulos que no dependen de Next.js, para poder moverlos a un backend aparte (por ejemplo, NestJS) sin reescribirlos.

## Reglas
1. **La lógica de negocio va en `src/modules/<módulo>/`**, nunca en componentes, páginas ni server actions.
2. **Las capas de cada módulo:** `domain/` (entidades, reglas, máquina de estados; TypeScript puro), `application/` (casos de uso), `infrastructure/` (repositorios y adaptadores) y `contracts/` (esquemas Zod de entrada y salida).
3. **Next.js es solo una capa de entrega:** las server actions y los route handlers validan con el contrato, arman el contexto (usuario, tenant) y llaman a un caso de uso. Nada más.
4. **Prohibido en `domain/`, `application/` y `contracts/`:** importar `next/*`, `react` o `@supabase/*`. Auth, storage, correo y colas se usan por interfaces (puertos) cuyos adaptadores viven en `infrastructure/` (o en `src/shared/adapters/`), los únicos lugares donde se permiten esos SDK. `next/*` y `react` no se importan en ninguna parte de `src/modules`.
5. **Acceso a datos con Drizzle ORM sobre PostgreSQL** (alojado en Supabase). Es portable a cualquier backend.
6. **Multi-cliente:** todo caso de uso recibe un `ctx` con `tenantId` y `userId`, y todo repositorio filtra por `tenantId`. RLS en Supabase queda activado como segunda defensa.
7. **API pública versionada** en `src/app/api/v1/*`, para los links de aprobación por correo, webhooks (WhatsApp) y una futura app móvil. Usa los mismos contratos.
8. **Tareas en segundo plano** (recordatorios, correos, cierre diario) mediante un puerto `JobQueue` implementado con **pg-boss**, en un proceso worker aparte (`src/worker.ts`) en Railway.
9. **Configuración** solo por variables de entorno, validadas con Zod en un único `env.ts`.
10. **Dependencias entre módulos:** un módulo solo usa a otro a través de sus casos de uso o de su `contracts/` público (`index.ts`), nunca importando su `infrastructure/` ni sus tablas directamente. Hay dos entradas públicas: `@/modules/<módulo>` (su `index.ts`) y `@/modules/<módulo>/contracts` (solo esquemas Zod, segura para componentes cliente: los formularios usan el mismo contrato que el servidor). Nada más profundo (regla de ESLint).

## Cómo se migra después
Se copia `src/modules` a un proyecto NestJS. Los casos de uso se exponen como controladores con los mismos contratos, y el frontend reemplaza las server actions por llamadas HTTP a esos contratos. El dominio, los repositorios, el worker y la base de datos no cambian.

## Estructura
```
src/
  app/                    # Next.js: páginas, layouts, server actions, api/v1
  modules/
    identity/             # tenants, planes, usuarios, membresías, auditoría
    catalog/              # productos, equipos, centros de costo, almacenes
    requests/             # SOF (luego PR/PD)
    approvals/            # políticas, instancias, pasos y eventos
    inventory/            # stock y movimientos
    documents/            # PDF y archivos adjuntos
    notifications/        # correo (luego WhatsApp/Teams)
      <módulo>/domain/ application/ infrastructure/ contracts/ index.ts
  shared/                 # ctx, errores, resultado, puertos (Mailer, FileStorage, JobQueue, AuthProvider, Clock)
  db/                     # esquema Drizzle, migraciones, seed
  ui/                     # componentes shadcn y design tokens del prototipo
  worker.ts               # proceso de jobs (pg-boss)
  env.ts
```
