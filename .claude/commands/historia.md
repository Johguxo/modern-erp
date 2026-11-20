---
description: Implementa una historia del backlog de punta a punta (plan, código, pruebas, revisión, PR)
argument-hint: <ID de la historia, por ejemplo E3-H2>
---

Implementa la historia **$ARGUMENTS** siguiendo este proceso. No te saltes pasos.

1. **Contexto.** Busca la historia `$ARGUMENTS` en `docs/backlog/`. Si no existe, dímelo y detente. Si sus dependencias (épicas anteriores) no están `hecha`, avísame antes de seguir.
   **Issue:** su número está en la línea `Estado: … · Issue: #N`. Revisa `gh issue view N --json assignees,state`: si está asignado a otra persona o cerrado, dímelo y detente. Si está libre, asígnamelo (`gh issue edit N --add-assignee @me`) y mueve su tarjeta del tablero #3 a **In Progress** (ver `docs/backlog/README.md` §Seguimiento en GitHub).
2. **Rama.** Desde `develop` actualizado (`git fetch origin && git switch develop && git pull --ff-only`), crea `feat/<id-en-minúsculas>-<slug-corto>`. Nunca partas de `main`.
3. **Plan.** Usa el subagente `arquitecto` para obtener el plan. Muéstrame el resumen, las preguntas abiertas y la lista de archivos. **Espera mi confirmación** si hay preguntas abiertas que bloquean; si no hay, continúa.
4. **Implementación.** Sigue el plan en este orden: migración y esquema → dominio → casos de uso y contratos → adaptadores → entrega en Next.js → UI. Haz commits pequeños con Conventional Commits.
5. **Pruebas.** Usa el subagente `tester` para cubrir cada criterio de aceptación. Ejecuta `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` (si tocaste datos) y `pnpm test:e2e` (si tocaste un flujo de las pantallas 1–3).
6. **Revisión.** Usa el subagente `revisor`. Corrige todo lo **Bloqueante** e **Importante** y vuelve a revisar hasta tener "Listo para PR".
7. **Backlog.** Marca los criterios cumplidos (`- [x]`), cambia `Estado:` a `en revisión` y actualiza la tabla de épicas en `docs/backlog/README.md` si corresponde.
8. **PR.** Rebasa sobre `origin/develop`, haz push de la rama (nunca a `main` ni a `develop`) y crea el PR **contra `develop`** con `gh pr create --base develop`: título `<ID>: <título>`, y en la descripción `Closes #N` (el issue de la historia), qué se hizo, cómo probarlo, capturas si hay UI y decisiones tomadas. Mueve el ítem del project a **In Review**.
9. **Resumen final** para mí: qué quedó hecho, qué decidiste por tu cuenta y qué queda pendiente.
