# Kit de arranque para Claude Code (19 nov 2026)

Entregado como `linkus-kit.zip` (descomprimir en la raíz del repositorio `Johguxo/modern-erp`).

## Contenido
- `CLAUDE.md`: contexto, stack, comandos, 11 reglas no negociables y cómo trabajar una historia.
- `docs/producto/prd-mvp.md`: alcance del MVP (solo SOF), fuera de alcance y cómo queda preparado, criterios de éxito de la demo.
- `docs/arquitectura/`: ADR-001 (monolito modular migrable), ADR-002 (login, 4 roles fijos con mapa de permisos, planes, SuperAdmin), ADR-003 (stack).
- `docs/dominio/flujo-sof-aprobaciones.md`: estados y transiciones, políticas con pasos (`users`/`role`, `any`/`all`), instancia con copia de la política, corrección de línea sin reiniciar (tolerancia y pasos de reconfirmación), entrega y stock, numeración, casos borde.
- `docs/dominio/modelo-datos.md`: tablas por módulo, RLS con rol `app_user` + `set local app.tenant_id`, seed.
- `docs/ui/`: mapa pantalla → ruta → casos de uso, design tokens, prototipo (8 `.dc.html`).
- `docs/backlog/`: E0 Fundaciones · E1 Identidad · E2 Catálogo · E3 Solicitudes · E4 Aprobaciones · E5 Documentos y avisos · E6 Inventario · E7 Calidad y despliegue (32 historias con criterios de aceptación y definición de hecha).
- `docs/setup/arranque.md`: herramientas, cuentas, primeros prompts y ritmo de trabajo.
- `.claude/`: settings (permisos y hooks), hooks (Prettier+ESLint al editar, typecheck al terminar), subagentes `arquitecto`, `tester`, `revisor`, comandos `/historia`, `/revisar`, `/estado`, `/adr`.
- `.mcp.json` (Supabase solo lectura, Playwright), `.env.example`, `.gitignore`.

## Primeros pasos
1. Crear repo, descomprimir, commit, `cp .env.example .env.local`.
2. `claude` → prompt de lectura y dudas (en `docs/setup/arranque.md`).
3. `/historia E0-H1`.
