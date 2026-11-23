# E5 · Documentos y avisos

### E5-H1 · PDF del SOF
**Criterios de aceptación**
- [ ] Plantilla con @react-pdf/renderer: logo y nombre del cliente, número, fecha, solicitante, equipo, centro de costo, motivo, tabla de ítems (revisión vigente), total, bloque de firmas (quién aprobó cada paso y cuándo) y nota si hubo correcciones.
- [ ] Se genera en el worker al quedar `approved` (y se regenera si hay correcciones), se guarda con `FileStorage` y se registra en `files`.
- [ ] "Descargar PDF" en la pantalla 3 entrega una URL firmada de corta duración; para borradores genera una vista previa al vuelo con marca "BORRADOR".

Estado: pendiente · Issue: [#25](https://github.com/Johguxo/modern-erp/issues/25)

### E5-H2 · Correos de aprobación
**Criterios de aceptación**
- [ ] Plantillas React Email en español y con la marca del cliente sobre el adaptador `Mailer` de E1-H3 (Resend). Las plantillas viven en `src/ui/emails`; los módulos pasan id de plantilla y datos.
- [ ] Correos: paso pendiente (al asignado, con botón "Revisar y aprobar" que abre `/solicitudes/[id]`), aprobado, rechazado, cambios pedidos (al solicitante), línea corregida (informativo), invitación (de E1).
- [ ] Envío asíncrono por la cola `notifications.send-email` con reintentos; el fallo de un correo nunca bloquea la acción del usuario.
- [ ] Respeta `tenant_settings.notification_channels`.
- [ ] En desarrollo, los correos se ven en Mailpit (http://127.0.0.1:54324), como desde E1-H3.

Estado: pendiente · Issue: [#26](https://github.com/Johguxo/modern-erp/issues/26)

### E5-H3 · Recordatorios
**Criterios de aceptación**
- [ ] Job programado cada hora (`approvals.reminders`): pasos `pending` con más de `reminder_hours` (por defecto 24) reciben un recordatorio, como máximo uno cada 24 h.
- [ ] Evento `reminder_sent` en la línea de tiempo.

Estado: pendiente · Issue: [#27](https://github.com/Johguxo/modern-erp/issues/27)
