# E7 · Calidad, demo y despliegue

### E7-H1 · Datos de demo
**Criterios de aceptación**
- [ ] `pnpm db:seed` crea lo descrito en `docs/dominio/modelo-datos.md` §Datos semilla, incluyendo los documentos del prototipo (SOF-0142, SOF-0141, SOF-0139 en distintos estados) para la demo.
- [ ] Usuarios de prueba por rol con contraseñas de `SEED_DEFAULT_PASSWORD`; nunca se ejecuta en producción salvo con `--allow-production`.
- [ ] Opción `--load` que genera 5,000 solicitudes para probar rendimiento.

Estado: pendiente

### E7-H2 · Suite E2E de la demo
**Criterios de aceptación**
- [ ] Playwright cubre los 6 criterios de éxito de `docs/producto/prd-mvp.md` §5, en escritorio y en viewport de celular (390×844).
- [ ] Prueba de aislamiento: un usuario de "Empresa prueba" no ve nada de Genrent (lista y URL directa → 404).
- [ ] Revisión de accesibilidad básica con `@axe-core/playwright` en las pantallas 1–3 sin errores graves.

Estado: pendiente

### E7-H3 · Despliegue en Railway
**Criterios de aceptación**
- [ ] Proyecto Supabase de producción con migraciones aplicadas por CI (job manual `deploy-db`).
- [ ] Railway: servicio `web` (`pnpm build && pnpm start`) y servicio `worker` (`pnpm worker`), con variables de entorno de producción.
- [ ] Dominio `app.linkus.pe` (o el que se defina) con HTTPS.
- [ ] Sentry configurado en web y worker; logs estructurados.
- [ ] Respaldo diario de la base confirmado en Supabase.
- [ ] `docs/setup/operacion.md` con cómo desplegar, revertir y crear un cliente nuevo.

Estado: pendiente

### E7-H4 · Puesta en marcha con Genrent
**Criterios de aceptación**
- [ ] Tenant Genrent creado desde la consola, con sus usuarios reales, catálogo, equipos y stock importados de sus archivos.
- [ ] Política de aprobación configurada según sus respuestas.
- [ ] Guía de uso de 1 página por rol (solicitante, almacén, aprobador, admin).

Estado: pendiente
