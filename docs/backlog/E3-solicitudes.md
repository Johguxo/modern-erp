# E3 · Solicitudes SOF

Referencia: `docs/dominio/flujo-sof-aprobaciones.md`, `docs/ui/mapa-pantallas.md` (pantallas 1, 2 y 3), prototipos `Main`, `NuevoSOF` y `DetalleSOF`.

### E3-H1 · Dominio de solicitudes
**Criterios de aceptación**
- [ ] Tablas `document_sequences`, `requests`, `request_lines`, `request_line_revisions` con RLS e índices.
- [ ] Entidad `Request` con la máquina de estados del §1 (todas las transiciones válidas e inválidas probadas).
- [ ] Cálculo de subtotales y total con `decimal.js`; el total siempre se recalcula en el servidor.
- [ ] Numeración al enviar con bloqueo de fila (prueba de concurrencia: 20 envíos simultáneos → 20 números distintos y consecutivos).
- [ ] Bloqueo optimista con `version`.

Estado: pendiente · Issue: [#16](https://github.com/Johguxo/modern-erp/issues/16)

### E3-H2 · Nuevo SOF y borradores (pantalla 2)
**Como** solicitante **quiero** armar un SOF eligiendo repuestos del catálogo **para** no escribir códigos ni precios a mano.

**Criterios de aceptación**
- [ ] `/solicitudes/nueva` y `/solicitudes/[id]/editar` fieles al prototipo `NuevoSOF.dc.html`.
- [ ] Buscador de catálogo con resultados en vivo (código, nombre, stock, precio, "Agregar"); agregar uno existente suma 1.
- [ ] Ítems editables (cantidad, equipo por línea, quitar); total en vivo.
- [ ] "Guardar borrador" y "Enviar a aprobación" (mínimo 1 ítem, cantidades > 0).
- [ ] Panel "Ruta de aprobación" con los pasos que aplicarán (usa `approvals.previewRoute`; mientras E4 no exista, muestra la política sin resolver usuarios).
- [ ] Funciona en el celular (390 px).
- [ ] E2E: crear borrador, editarlo y enviarlo.

Estado: pendiente · Issue: [#17](https://github.com/Johguxo/modern-erp/issues/17)

### E3-H3 · Bandeja (pantalla 1)
**Como** usuario **quiero** ver mis solicitudes y las que esperan mi aprobación **para** saber qué me toca hacer.

**Criterios de aceptación**
- [ ] `/bandeja` fiel al prototipo `Main.dc.html`: tarjetas de resumen, pestañas, tabla y botón "+ Nueva solicitud".
- [ ] Visibilidad: con `requests.read_all` ve todas las del tenant; si no, solo las propias y aquellas donde es aprobador asignado.
- [ ] "Esperan mi aprobación" = documentos con un paso `pending` donde el usuario es asignado y aún no decidió.
- [ ] Búsqueda por número o texto, paginación del servidor (25), orden por última actualización.
- [ ] Pastillas de estado con texto (design tokens).
- [ ] Rendimiento: < 1 s con 5,000 solicitudes en el seed de carga.

Estado: pendiente · Issue: [#18](https://github.com/Johguxo/modern-erp/issues/18)

### E3-H4 · Detalle del SOF (pantalla 3, lectura)
**Criterios de aceptación**
- [ ] `/solicitudes/[id]` fiel al prototipo `DetalleSOF.dc.html`: cabecera, estado, ítems, documento y panel de línea de tiempo.
- [ ] 404 si no existe o es de otro tenant o el usuario no tiene visibilidad.
- [ ] Los botones de acción se muestran según estado y permisos (la lógica de acciones llega en E4 y E6).

Estado: pendiente · Issue: [#19](https://github.com/Johguxo/modern-erp/issues/19)

### E3-H5 · Anular
**Criterios de aceptación**
- [ ] El solicitante anula sus borradores o documentos `in_approval`/`changes_requested`; el admin también los `approved` no entregados.
- [ ] Comentario obligatorio; evento `cancelled`; los pasos pendientes se cierran.

Estado: pendiente · Issue: [#20](https://github.com/Johguxo/modern-erp/issues/20)
