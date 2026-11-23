# Arranque: de este kit a la primera historia

## 1. Lo que necesitas instalar en tu computadora

| Herramienta | Para qué | Cómo verificar |
|---|---|---|
| Node.js 22 LTS | Ejecutar la app | `node -v` |
| pnpm | Paquetes | `pnpm -v` (`corepack enable` lo instala) |
| Docker Desktop (con WSL2 en Windows) | Supabase local | `docker ps` |
| Supabase CLI | Base de datos, Auth y Storage locales | Viene en `devDependencies`: `pnpm exec supabase --version` (no hace falta instalarla global) |
| Git y GitHub CLI | Repositorio y PRs | `git --version`, `gh auth status` |
| Claude Code | La fábrica | `claude --version` |

## 2. Cuentas

| Servicio | Qué crear | Cuándo |
|---|---|---|
| GitHub | Repositorio `Johguxo/modern-erp` (ya creado) | Hecho |
| Supabase | Proyecto de producción (región São Paulo, la más cercana a Lima) | Antes de E7 (para desarrollar basta el local) |
| Railway | Proyecto con servicios `web` y `worker` | En E7 |
| Resend | Cuenta y dominio `linkus.pe` verificado | En E5 |
| Sentry | Proyecto Next.js | En E7 |

## 3. Preparar el repositorio

```bash
gh repo clone Johguxo/modern-erp
cd modern-erp
# Descomprime aquí el contenido del kit (CLAUDE.md, .claude/, .mcp.json, docs/, .env.example, .gitignore)
git add . && git commit -m "docs: kit inicial de planificación y harness de Claude Code"
git push -u origin main
git switch -c develop && git push -u origin develop   # rama de integración
cp .env.example .env.local
```

## 3b. Base de datos local

```bash
pnpm install
pnpm exec supabase start        # la primera vez descarga imágenes de Docker (varios minutos)
pnpm exec supabase status -o env  # claves locales para .env.local
pnpm db:migrate                 # aplica src/db/migrations
pnpm test:int                   # pruebas de integración (RLS, roles)
```

- Copia a tu `.env.local` las claves que imprime `supabase status`: `ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`. Las URLs de `.env.example` ya apuntan a la base local.
- `pnpm db:reset` recrea la base local desde cero (login local de `app_user` + migraciones).
- `pnpm exec supabase stop` la detiene conservando los datos. Studio: http://127.0.0.1:54323 · correos: http://127.0.0.1:54324.
- Usa los puertos 54321–54327: si tienes otro proyecto de Supabase corriendo, detenlo antes (`pnpm exec supabase stop --project-id <otro>`).
- Las migraciones solo se crean con drizzle-kit (`pnpm db:generate`, o `pnpm db:generate --custom --name=<slug>` para SQL a mano). No uses `supabase migration`.

### Worker (jobs)

```bash
pnpm worker        # arranca pg-boss y crea las colas (necesita Supabase local y .env.local)
```

Debe registrar `worker started` con las 4 colas. Con **Ctrl+C** se apaga limpio (`worker stopped`) y sale con 0; en Railway hace lo mismo con SIGTERM. Las colas viven en el esquema `pgboss` de la base (lo crea pg-boss solo).

## 4. Primera sesión con Claude Code

Abre la terminal en la carpeta del repo y ejecuta `claude`. Luego, en este orden:

**Prompt 1: que entienda el proyecto (sin escribir código)**
```
Lee CLAUDE.md y todo docs/. Luego dame:
1) un resumen de lo que vamos a construir en el MVP,
2) contradicciones o huecos que encuentres entre los documentos,
3) dudas que necesites resolver antes de empezar E0.
No escribas código todavía.
```

Resuelve sus dudas. Si algo cambia una decisión, pídele que actualice el documento correspondiente.

**Prompt 2: empezar**
```
/historia E0-H1
```

Después sigue con `/historia E0-H2`, `E0-H3`, etc. Usa `/estado` para ver el avance y la siguiente historia.

## 5. Ritmo de trabajo recomendado

- **Una historia por sesión.** Al terminar, revisa el PR (contra `develop`) en GitHub, haz merge y usa `/clear` antes de la siguiente.
- **Ramas:** historias desde `develop` y PR a `develop`; cuando `develop` está estable, el líder corre `/release` para abrir el PR `develop` → `main`. Detalle en `CLAUDE.md` §Ramas y PRs.
- **Modo plan** (Shift+Tab) cuando quieras ver el plan antes de que toque archivos.
- **Tú revisas cada PR**, sobre todo en E1 (seguridad), E3-H1 (numeración) y E4 (aprobaciones). Son los que más cuesta corregir después.
- **Si se equivoca dos veces en lo mismo**, agrega la regla a `CLAUDE.md` para que no vuelva a pasar.
- **Historias en paralelo** (por ejemplo, E5 y E6): abre otra sesión en un worktree aparte (`git worktree add ../modern-erp-e6 -b feat/e6-h1-stock origin/develop`) para que no choquen.
- **Lo que nunca debe hacer solo:** push a `main` o `develop`, `supabase db push` a producción, leer `.env.local`. El archivo `.claude/settings.json` lo bloquea; además, protege `main` y `develop` en GitHub (ver §7), porque un `git push` sin argumentos estando en esas ramas no se puede filtrar por permisos.

## 6. Qué trae el harness

| Archivo | Qué hace |
|---|---|
| `CLAUDE.md` | Contexto, stack, comandos y reglas que Claude Code lee en cada sesión |
| `.claude/settings.json` | Permisos (qué puede ejecutar sin preguntar y qué está bloqueado) y hooks |
| `.claude/hooks/post-edit.mjs` | Tras cada edición: Prettier + ESLint del archivo; si ESLint falla, Claude lo corrige |
| `.claude/hooks/on-stop.mjs` | Al terminar un turno con cambios de código: typecheck; si falla, Claude lo corrige |
| `.claude/agents/arquitecto.md` | Planifica una historia (no edita) |
| `.claude/agents/tester.md` | Escribe y corre las pruebas |
| `.claude/agents/revisor.md` | Revisa contra los ADR y la definición de hecha (no edita) |
| `.claude/commands/historia.md` | `/historia <ID>`: plan → código → pruebas → revisión → PR |
| `.claude/commands/revisar.md` | `/revisar`: revisión de la rama actual |
| `.claude/commands/estado.md` | `/estado`: avance del backlog |
| `.claude/commands/adr.md` | `/adr <tema>`: propone una nueva decisión de arquitectura |
| `.claude/commands/release.md` | `/release`: abre el PR `develop` → `main` con el resumen de historias (solo el líder) |
| `.github/pull_request_template.md` | Plantilla de PR con la Definición de hecha |
| `.claude/skills/` + `skills-lock.json` | Skills públicas copiadas al repo y fijadas a un commit: `codebase-design` (mattpocock), `frontend-design` (anthropics), `web-design-guidelines` (vercel-labs), `supabase-postgres-best-practices` (supabase). Llegan con el clone, sin instalar nada. Precedencia frente a los docs: `CLAUDE.md` §Skills externas |
| Plugin `modern-web-guidance@googlechrome` | Skills públicas de Google Chrome con buenas prácticas web actuales. Declarado en `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`): al abrir el repo y confiar en la carpeta, Claude Code ofrece instalarlo. Para agregar otro plugin solo a este proyecto: `claude plugin install <plugin>@<marketplace> --scope project` |

## 7. Protección de ramas en GitHub

En *Settings → Branches* (o con `gh api`), para `main` y `develop`:
- Rama por defecto del repo: `develop` (así los PRs apuntan ahí sin pensarlo).
- Requerir PR antes de hacer merge, con al menos 1 aprobación; bloquear push directo y force-push.
- Requerir que pasen los checks del CI (`.github/workflows/ci.yml`): **`checks`** (lint, formato, typecheck, pruebas unitarias y build) e **`integration`** (Postgres de Supabase local, migraciones y pruebas de integración). En *Settings → Branches → Require status checks*, búscalos después del primer PR que los ejecute.
- En `main`, solo el líder puede hacer merge.
| `.mcp.json` | Supabase (solo lectura, proyecto en la nube) y Playwright (navegador para probar la UI) |

La implementación la hace la sesión principal de Claude Code; los subagentes la apoyan en planificar, probar y revisar.

**MCP de Supabase:** solo sirve cuando exista el proyecto en la nube. Exporta `SUPABASE_PROJECT_REF` y `SUPABASE_ACCESS_TOKEN` (token personal de supabase.com → Account → Access Tokens) en tu terminal antes de abrir `claude`. Mientras tanto, Claude Code trabaja con la base local por la CLI.
