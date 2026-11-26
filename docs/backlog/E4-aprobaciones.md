# E4 · Motor de aprobaciones

Referencia: `docs/dominio/flujo-sof-aprobaciones.md` §2–§4 y §8.

### E4-H1 · Políticas y su pantalla
**Criterios de aceptación**
- [x] Tablas `approval_policies`, `approval_policy_steps` con RLS.
- [x] `/configuracion/aprobaciones`: ver y editar los pasos de la política del SOF (nombre, tipo de aprobador `users` o `role`, aprobadores, regla `any`/`all`, orden). Los campos de condiciones quedan ocultos pero el modelo los guarda.
- [x] Validación: al menos un paso; cada paso con al menos un aprobador; un rol sin usuarios muestra advertencia.
- [x] `previewRoute(docType, total)` devuelve los pasos y aprobadores que aplicarían.
- [x] `platform.createTenant` (E1-H4) crea la política "SOF estándar": paso 1 "Almacén" (rol `warehouse`) y paso 2 "Gerencia local" (rol `approver`); el admin del cliente la ajusta después.

> Nota (E3-H2): `approvals.previewRoute` ya existe con el puerto `PolicySource.activeFor(ctx, {docType, total})` y un adaptador provisional (`standardPolicySource`, `STANDARD_SOF_POLICY`). Aquí se reemplaza ese adaptador por el repositorio de políticas (aplicando `min_amount` y resolviendo aprobadores) y se reutiliza `STANDARD_SOF_POLICY` como semilla en `createTenant`; la UI del panel no cambia.

Estado: en revisión · Issue: [#21](https://github.com/Johguxo/modern-erp/issues/21)

### E4-H2 · Instancia y decisión
**Como** aprobador **quiero** aprobar, rechazar o pedir cambios **para** que la solicitud avance sin correos sueltos.

**Criterios de aceptación**
- [ ] Al enviar un SOF se crea la instancia con copia de la política, pasos y asignados (§3).
- [ ] `decide({stepId, decision, comment})`: valida que el usuario sea asignado, que el paso esté `pending` y que no sea su propia solicitud; aplica la regla `any`/`all`; avanza al siguiente paso o cierra el documento (`approved`, `rejected`, `changes_requested`).
- [ ] Rechazar y pedir cambios exigen comentario.
- [ ] Concurrencia: dos decisiones simultáneas → solo la primera cuenta (prueba).
- [ ] Reenvío tras `changes_requested` crea pasos nuevos desde el primero; los eventos anteriores se conservan.
- [ ] Botones en la pantalla 3 y contador en la bandeja.
- [ ] Eventos en `approval_events` y registro en `audit_events`.

> Nota (E4-H1): al enviar, leer la política activa y sus pasos en una sola consulta dentro de la transacción (`PolicyRepository.findActive`) y copiarlos a la instancia; si no hay política, el envío falla (la vista previa sí degrada a ruta vacía). Si la política tiene pasos que el MVP no soporta (`hasReservedSteps`), decidir si se bloquea el envío. Aplicar aquí la regla «nadie aprueba su propia solicitud» y `stepApplies` para marcar `skipped`.

> Nota (E3-H5): implementar el puerto `ApprovalCanceller.cancel(ctx, {requestId, comment})` de requests (hoy `noopApprovalCanceller`): instancia `cancelled`, pasos `pending`/`waiting` cerrados (decidir `skipped` o agregar `cancelled` al check) y evento `cancelled` con el comentario. Bloquear primero la solicitud, como `cancelRequest`.

> Nota (E3-H3): implementar el puerto `ApprovalAssignments` de requests (`assignedRequestIds`, `pendingRequestIds`, `isAssigned`) sobre `approval_steps`/`approval_step_assignees` y pasarlo en `createRequestsDeps`/`createGetRequestDeps`/`createListRequestsDeps` (hoy `noopApprovalAssignments`). Si las listas de ids crecen, cambiar a `= any($1::uuid[])` o a subconsulta.

> Nota (E3-H1/H2): `submitRequest` llama al puerto `ApprovalStarter` (hoy `noopApprovalStarter`). Aquí se reemplaza por el real. Los SOF enviados antes de esta historia quedaron en `in_approval` sin instancia: crearles su instancia (o confirmar que no hay ninguno en producción).

> Nota (E3-H4): el detalle ya muestra `approve`, `request_changes`, `reject` (si `pendingForMe`) y `resubmit` (dueño en `changes_requested`) deshabilitados. Aquí: conectarlos (con `stepId`) y agregarlos a `IMPLEMENTED_ACTIONS`; `pendingForMe` puede pasar a un `isPending(ctx, id)` del puerto `ApprovalAssignments`.

Estado: pendiente · Issue: [#22](https://github.com/Johguxo/modern-erp/issues/22)

### E4-H3 · Línea de tiempo
**Criterios de aceptación**
- [ ] `getTimeline(requestId)` combina eventos y pasos futuros en una lista ordenada para la interfaz.
- [ ] Panel de la pantalla 3 igual al prototipo: hechos en verde con check, pendiente en ámbar, futuros en gris; cada ítem con quién y cuándo (zona del tenant).

> Nota (E3-H4): la línea de tiempo sale hoy de `deriveTimeline` (fechas de la solicitud, sin autor en aprobada/rechazada/anulada). Aquí: puerto `ApprovalTimeline` con `approval_events`; `deriveTimeline` queda de respaldo para SOF sin instancia. El tipo `TimelineItem` ya trae `actorId`/`actorName` y `comment`. El ítem `cancelled` de los SOF sin instancia sale de `closed_by`/`close_comment` (E3-H5).

Estado: pendiente · Issue: [#23](https://github.com/Johguxo/modern-erp/issues/23)

### E4-H4 · Corrección de una línea sin reiniciar
**Como** almacén **quiero** corregir una línea mal registrada **para** no obligar a todos a firmar de nuevo.

**Criterios de aceptación**
- [ ] Diálogo "Corregir una línea" (permiso `requests.correct_line`) en estados `in_approval` y `approved`: equipo, producto, cantidad, precio, notas, motivo obligatorio; también agregar o quitar una línea.
- [ ] Guarda la revisión anterior en `request_line_revisions` e incrementa `revision`.
- [ ] Aplica la regla de reaprobación del §4 con `reapproval_tolerance_pct`: si el total no sube por encima de la tolerancia, las firmas se mantienen; si sube, crea un paso `reconfirmation` solo para las líneas cambiadas y, si estaba `approved`, vuelve a `in_approval`.
- [ ] Aviso naranja y línea resaltada en la pantalla 3 (texto del prototipo).
- [ ] Evento `line_corrected` con antes/después; aviso informativo a quienes ya aprobaron.
- [ ] Pruebas unitarias de las tres ramas de la regla y una E2E del caso del prototipo (cambiar `GEN-046` por `GEN-045`).

> Nota (E3-H4): `correct_line` ya se muestra (deshabilitada) a quien tiene `requests.correct_line` en `in_approval`/`approved`. El resaltado y el aviso de línea corregida usan `revision`/`needsReconfirmation`, que ya vienen en la vista; la columna # muestra `lineNo`.

Estado: pendiente · Issue: [#24](https://github.com/Johguxo/modern-erp/issues/24)
