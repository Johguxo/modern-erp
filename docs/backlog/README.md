# Backlog del MVP

Cada épica es un archivo `E<n>-<nombre>.md` con sus historias. Una historia se identifica como `E3-H2` y se trabaja con el comando `/historia E3-H2`.

## Orden de ejecución

Las épicas se hacen en orden; dentro de cada épica, las historias también, salvo que diga "puede ir en paralelo".

| Épica | Nombre | Depende de | Estado |
|---|---|---|---|
| E0 | Fundaciones del proyecto | — | Pendiente |
| E1 | Identidad, acceso y SuperAdmin | E0 | Pendiente |
| E2 | Catálogo y datos maestros | E1 | Pendiente |
| E3 | Solicitudes SOF | E2 | Pendiente |
| E4 | Motor de aprobaciones | E3 | Pendiente |
| E5 | Documentos y avisos | E4 | Pendiente |
| E6 | Inventario y entrega | E4 | Pendiente (puede ir en paralelo con E5) |
| E7 | Calidad, demo y despliegue | E5, E6 | Pendiente |

## Estado de cada historia

Al pie de cada historia hay una línea `Estado:`. Valores: `pendiente`, `en curso`, `en revisión`, `hecha`. Claude Code la actualiza en el mismo PR que implementa la historia.

## Seguimiento en GitHub

- **Issues:** cada historia tiene un issue con la etiqueta `historia` (enlazado en su línea `Estado:`). El issue dice **quién la tiene** (assignee) y su avance; los criterios y notas técnicas viven solo aquí, en `docs/backlog/`.
- **Milestones:** uno por épica (`E0 · Fundaciones del proyecto`, …), con el porcentaje de issues cerrados.
- **Project `modern-erp`** ([tablero #3](https://github.com/users/Johguxo/projects/3)): columnas `Todo` → `In Progress` → `In Review` → `Done`.

| Momento | Issue / project | Línea `Estado:` (en el PR) |
|---|---|---|
| Nadie la tomó | sin asignar · `Todo` | `pendiente` |
| Alguien la toma (`/historia`) | asignado · `In Progress` | `en curso` |
| PR abierto contra `develop` (`Closes #N`) | `In Review` | `en revisión` |
| PR integrado en `develop` | cerrado automáticamente · `Done` | `en revisión` |
| Release a `main` | — | `hecha` (PR posterior al release) |

**Tomar una historia:** asígnate el issue antes de crear la rama; si ya tiene assignee, es de otra persona. **Historia nueva:** agrégala aquí con la plantilla y crea su issue (`gh issue create --label historia --milestone "<épica>"`), luego enlázalo en su línea `Estado:`.

Mover una tarjeta desde la terminal (IDs fijos del tablero #3):

```bash
ITEM=$(gh project item-list 3 --owner Johguxo --format json --limit 200 --jq '.items[] | select(.content.number==<N>) | .id')
gh project item-edit --id "$ITEM" --project-id PVT_kwHOAjZWH84BsbVo \
  --field-id PVTSSF_lAHOAjZWH84BsbVozhqpkCA --single-select-option-id <opción>
```

| Columna | `<opción>` |
|---|---|
| Todo | `334872f7` |
| In Progress | `28dcdd10` |
| In Review | `46b57aad` |
| Done | `be8008de` |

Una historia nueva entra al tablero con `gh project item-add 3 --owner Johguxo --url <url del issue>` (o sola, si está activo el workflow *Auto-add* del project).

## Definición de "hecha" (para toda historia)

- [ ] Cumple todos sus criterios de aceptación.
- [ ] Respeta ADR-001 (capas y reglas de imports), ADR-002 y ADR-003.
- [ ] Toda consulta filtra por `tenant_id`; si toca tablas nuevas, tiene política RLS y prueba de aislamiento entre dos tenants.
- [ ] Pruebas: unitarias del dominio y casos de uso; integración si toca base de datos; E2E si cambia un flujo de las pantallas 1–3.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.
- [ ] Textos visibles en el archivo de mensajes (es-PE).
- [ ] Estados de carga, vacío y error en las pantallas que toca.
- [ ] Si cambió una decisión, se actualizó el documento en `docs/` correspondiente.
- [ ] PR contra `develop` con descripción: qué, por qué, cómo probarlo y capturas si hay UI (plantilla en `.github/pull_request_template.md`).

## Plantilla de historia

```
### E<n>-H<m> · <Título corto>
**Como** <rol> **quiero** <acción> **para** <beneficio>.

**Criterios de aceptación**
- [ ] ...

**Notas técnicas**
- ...

Estado: pendiente · Issue: #<n>
```

## Fuera del MVP (no crear historias todavía)
Login con Microsoft · cadenas por monto y aprobación de Hong Kong · PR/PD · cotizaciones con IA · órdenes de compra · WhatsApp y Teams · SharePoint · tablero · cierre diario · varios almacenes · roles personalizados · cobro de suscripciones. El diseño de datos y arquitectura ya los contempla (ver `docs/producto/prd-mvp.md` §4).
