---
description: Muestra el avance del backlog del MVP y la siguiente historia a trabajar
---

Lee `docs/backlog/README.md` y todos los archivos `docs/backlog/E*.md`. Muéstrame:
1. Una tabla por épica con sus historias y su `Estado:`.
2. El porcentaje de historias `hecha` sobre el total.
3. La siguiente historia a trabajar según el orden y las dependencias.
4. Quién tiene qué: `gh issue list --label historia --state all --limit 100 --json number,title,assignees,state,milestone` (y, si existe el project `modern-erp`, la columna Status de `gh project item-list <n> --owner Johguxo`).
5. Diferencias a corregir: issues asignados cuya historia sigue `pendiente`, historias `hecha` con issue abierto, ramas (`git branch -r`) o PRs abiertos (`gh pr list`) sin issue.
No modifiques archivos.
