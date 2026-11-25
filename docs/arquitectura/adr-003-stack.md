# ADR-003 – Stack tecnológico del MVP

**Fecha:** 19 nov 2026 · **Estado:** aceptada

| Área | Elección | Notas |
|---|---|---|
| Lenguaje | TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess: true`) | |
| Gestor de paquetes | pnpm | |
| Framework | Next.js (App Router) | Server Components por defecto; Client Components solo donde haya interacción |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react | Tokens del prototipo en `docs/ui/design-tokens.md` |
| Formularios | React Hook Form + Zod (`@hookform/resolvers`) | El mismo esquema Zod del `contracts/` del módulo |
| Tablas | TanStack Table | Bandeja y listas de admin |
| Base de datos | PostgreSQL en Supabase | Supabase CLI para entorno local |
| ORM y migraciones | Drizzle ORM + drizzle-kit | Migraciones versionadas en `src/db/migrations`; RLS en migraciones SQL |
| Auth | Supabase Auth (correo y contraseña) vía `@supabase/ssr` | Solo dentro del adaptador `AuthProvider` y de `src/proxy.ts` (el middleware de Next.js 16) |
| Archivos | Supabase Storage | Solo dentro del adaptador `FileStorage` |
| Jobs | pg-boss | Worker separado (`pnpm worker`) |
| PDF | @react-pdf/renderer | Generado en el worker o en un route handler |
| Correo | Resend + React Email | Solo dentro del adaptador `Mailer` |
| Importación Excel/CSV | `read-excel-file` (leer .xlsx), `write-excel-file` (plantillas), `papaparse` (CSV) y `fflate` (revisar el zip antes de leerlo) | Validación fila por fila con Zod. Solo dentro de los adaptadores `SpreadsheetReader`/`SpreadsheetWriter` (`src/shared/adapters`). SheetJS (`xlsx`) descartado: el paquete de npm quedó en 0.18.5 con CVE-2023-30533 y CVE-2024-22363. Una futura exportación a CSV debe escapar los textos que empiezan con `=`, `+`, `-` o `@` |
| Pruebas unitarias | Vitest | Dominio y casos de uso |
| Pruebas de integración | Vitest + base local de Supabase | Repositorios y RLS |
| Pruebas E2E | Playwright | Flujos de las pantallas 1–3 |
| Calidad | ESLint (incluye regla de imports prohibidos en `src/modules`), Prettier, `tsc --noEmit` | |
| CI | GitHub Actions | lint, typecheck, test, build en cada PR |
| Despliegue | Railway: servicio `web` (Next.js) y servicio `worker` | Vercel Hobby no permite uso comercial |
| Observabilidad | Logs estructurados (pino) + Sentry (plan gratuito) | |
| Fechas | `Intl.DateTimeFormat` con la zona del tenant (`src/ui/format/date.ts`); date-fns solo si hace falta aritmética de fechas | UTC en base de datos, America/Lima en pantalla |
| Montos | `numeric(14,2)` en BD; `decimal.js` en dominio; en pantalla `Intl.NumberFormat` sobre el string decimal (`src/ui/format/money.ts`) | Nunca `float` para dinero |

## Regla de imports (ESLint)
Dentro de `src/modules/**` están prohibidos: `next`, `next/*`, `react`, `react-dom`, `@supabase/*`, `resend`, `pg-boss`. Solo los adaptadores en `src/modules/**/infrastructure/**` y `src/shared/adapters/**` pueden importar `@supabase/*`, `resend` y `pg-boss`. Ningún módulo importa la carpeta `infrastructure/` de otro módulo.
