# E2 · Catálogo y datos maestros

### E2-H1 · Esquema y casos de uso del catálogo
**Criterios de aceptación**
- [ ] Tablas `warehouses`, `products`, `equipment`, `cost_centers`, `import_jobs` con RLS e índices (incluido `pg_trgm` en productos).
- [ ] Casos de uso: listar con filtros y paginación, crear/editar, desactivar (no borrar), `searchProducts(q)` por código o nombre (el stock del almacén por defecto se agrega en E6-H1).
- [ ] Códigos únicos por tenant; error `ConflictError` con mensaje claro.
- [ ] `platform.createTenant` (E1-H4) crea el almacén por defecto del nuevo cliente.
- [ ] Pruebas de aislamiento entre tenants.

Estado: pendiente · Issue: [#13](https://github.com/Johguxo/modern-erp/issues/13)

### E2-H2 · Pantallas de productos, equipos y centros de costo
**Como** admin o almacén **quiero** mantener el catálogo **para** que las solicitudes usen códigos y precios correctos.

**Criterios de aceptación**
- [ ] `/configuracion/productos`, `/configuracion/equipos`, `/configuracion/centros-de-costo` con tabla, búsqueda, crear/editar en diálogo y activar/desactivar.
- [ ] Precio referencial con moneda del tenant; formato es-PE.
- [ ] Estados de vacío con botón "Importar desde Excel".

Estado: pendiente · Issue: [#14](https://github.com/Johguxo/modern-erp/issues/14)

### E2-H3 · Importación desde Excel/CSV
**Como** admin **quiero** subir mi Excel de productos y de equipos **para** no cargarlos uno por uno.

**Criterios de aceptación**
- [ ] Plantillas descargables (`.xlsx`) con las columnas esperadas.
- [ ] Subida → vista previa de las primeras 20 filas → confirmar. El procesamiento corre en el worker (`catalog.import`).
- [ ] Validación fila por fila con Zod: filas válidas se insertan o actualizan por `code`; las inválidas se listan con número de fila y motivo.
- [ ] Resumen final: creados, actualizados, con error. Guardado en `import_jobs`.
- [ ] Prueba con un archivo de 2,000 filas en menos de 30 s.

Estado: pendiente · Issue: [#15](https://github.com/Johguxo/modern-erp/issues/15)
