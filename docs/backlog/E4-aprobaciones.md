# E4 · Motor de aprobaciones

Referencia: `docs/dominio/flujo-sof-aprobaciones.md` §2–§4 y §8.

### E4-H1 · Políticas y su pantalla
**Criterios de aceptación**
- [ ] Tablas `approval_policies`, `approval_policy_steps` con RLS.
- [ ] `/configuracion/aprobaciones`: ver y editar los pasos de la política del SOF (nombre, tipo de aprobador `users` o `role`, aprobadores, regla `any`/`all`, orden). Los campos de condiciones quedan ocultos pero el modelo los guarda.
- [ ] Validación: al menos un paso; cada paso con al menos un aprobador; un rol sin usuarios muestra advertencia.
- [ ] `previewRoute(docType, total)` devuelve los pasos y aprobadores que aplicarían.
- [ ] `platform.createTenant` (E1-H4) crea la política "SOF estándar": paso 1 "Almacén" (rol `warehouse`) y paso 2 "Gerencia local" (rol `approver`); el admin del cliente la ajusta después.

Estado: pendiente · Issue: [#21](https://github.com/Johguxo/modern-erp/issues/21)

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

Estado: pendiente · Issue: [#22](https://github.com/Johguxo/modern-erp/issues/22)

### E4-H3 · Línea de tiempo
**Criterios de aceptación**
- [ ] `getTimeline(requestId)` combina eventos y pasos futuros en una lista ordenada para la interfaz.
- [ ] Panel de la pantalla 3 igual al prototipo: hechos en verde con check, pendiente en ámbar, futuros en gris; cada ítem con quién y cuándo (zona del tenant).

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

Estado: pendiente · Issue: [#24](https://github.com/Johguxo/modern-erp/issues/24)
