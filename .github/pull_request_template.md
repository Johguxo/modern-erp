<!-- Título: `<ID>: <título>` (por ejemplo, `E3-H2: Nuevo SOF y borradores`). Base: `develop` (salvo release o hotfix). -->

## Historia

<!-- ID y enlace a la historia en docs/backlog/ -->

## Qué se hizo y por qué


## Cómo probarlo

1.

## Capturas (si hay UI)

<!-- Escritorio y celular (390×844) -->

## Decisiones tomadas

<!-- Lo que se decidió sin estar en los docs. Si cambia una decisión de arquitectura, enlaza la ADR. -->

## Definición de hecha

- [ ] Cumple todos los criterios de aceptación de la historia.
- [ ] Respeta ADR-001 (capas e imports), ADR-002 y ADR-003.
- [ ] Toda consulta filtra por `tenant_id`; tablas nuevas con RLS y prueba de aislamiento entre dos tenants.
- [ ] Pruebas unitarias; de integración si toca datos; E2E si cambia un flujo de las pantallas 1–3.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.
- [ ] Textos visibles en `src/ui/messages/es-PE.ts`.
- [ ] Estados de carga, vacío y error en las pantallas que toca.
- [ ] Docs actualizados si cambió una decisión; `Estado:` de la historia actualizado.
