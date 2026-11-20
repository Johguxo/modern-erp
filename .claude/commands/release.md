---
description: Prepara el PR de release develop → main con el resumen de historias incluidas (solo el líder)
argument-hint: [nombre o versión del release, opcional]
---

Prepara un release de `develop` a `main`. **No hagas merge ni push a `main` ni a `develop`.**

1. `git fetch origin`. Si no hay commits nuevos (`git log origin/main..origin/develop --oneline` vacío), dímelo y detente.
2. Revisa que `develop` esté sana: `gh pr checks` del último PR integrado o, si no hay CI todavía, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` sobre `origin/develop` (en un worktree temporal: `git worktree add ../modern-erp-release origin/develop`, y bórralo al terminar). Si algo falla, repórtalo y detente.
3. Lista los PRs integrados en `develop` desde el último release (`gh pr list --base develop --state merged`) y agrúpalos por historia (`E<n>-H<m>`). Cruza con `docs/backlog/`: las historias incluidas deberían estar en `en revisión` o `hecha`.
4. Señala riesgos del release: migraciones nuevas en `src/db/migrations` (se aplican en producción con el job `deploy-db`), variables de entorno nuevas en `.env.example` y cambios en jobs del worker.
5. Muéstrame el borrador del PR y **espera mi confirmación**. Título: `Release: $ARGUMENTS` (o la fecha, `Release AAAA-MM-DD`). Cuerpo: historias incluidas con enlace a su PR, migraciones, variables nuevas, pasos de despliegue y cómo revertir.
6. Con mi confirmación, crea el PR con `gh pr create --base main --head develop`. El merge lo hago yo (merge commit, sin squash).
7. Después del merge, recuérdame marcar las historias del release como `hecha` en `docs/backlog/` mediante un PR a `develop`.
