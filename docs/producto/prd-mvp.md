# PRD – Plataforma LinkUs de Compras y Almacén · MVP

**Versión:** 1.0 · **Fecha:** 19 nov 2026 · **Cliente piloto:** Genrent (Perú)

## 1. Problema

Genrent opera compras y almacén sin ERP. Las solicitudes de almacén (SOF) nacen en un Excel ("pre-SOF") que una persona convierte a mano en el SOF oficial; las firmas se recogen una por una en SharePoint; cada día se concilia el pre-SOF contra el SOF; y un error en una línea (por ejemplo, un repuesto asignado al motor equivocado) obliga a reiniciar todas las firmas. No hay catálogo con códigos ni visibilidad del estado de cada solicitud.

## 2. Objetivo del MVP

Que Genrent cree, apruebe y entregue **solicitudes de almacén (SOF)** en una sola plataforma web, sin Excel intermedio, con:
- catálogo y total automático,
- cadena de aprobación configurable con línea de tiempo,
- **corrección de una línea sin reiniciar las aprobaciones**,
- PDF del documento y aviso por correo a cada aprobador,
- stock que se descuenta al entregar.

## 3. Usuarios del MVP

| Rol | Quién en Genrent (ejemplo) | Qué hace |
|---|---|---|
| SuperAdmin (LinkUs) | Erick, Johann | Crea el cliente, su plan y su primer admin |
| Admin del cliente | Ruby | Usuarios, catálogo, equipos, centros de costo, cadena de aprobación |
| Solicitante | Técnicos, mantenimiento | Crea SOF y sigue su estado |
| Almacén | Jhony | Aprueba por stock, corrige líneas, registra la entrega |
| Aprobador | Ruby, Sergio | Aprueba o rechaza en su paso |

## 4. Alcance

### Entra en el MVP
1. **Login** con correo y contraseña, invitación por correo y recuperación de contraseña.
2. **Consola mínima de SuperAdmin:** crear cliente, asignar plan y límites, invitar a su primer admin.
3. **Administración del cliente:** usuarios y roles (respetando el límite del plan), productos, equipos, centros de costo; importación de productos, equipos y stock inicial desde Excel/CSV.
4. **Bandeja** (pantalla 1) con filtros: todas, esperan mi aprobación, en aprobación, aprobadas.
5. **Nuevo SOF** (pantalla 2): datos generales, búsqueda en catálogo, líneas con cantidad, precio referencial y total automático; guardar borrador o enviar.
6. **Detalle del SOF** (pantalla 3): líneas, línea de tiempo, aprobar, rechazar, pedir cambios y **corregir una línea**.
7. **Motor de aprobaciones:** una política por tipo de documento con pasos en orden; cada paso apunta a usuarios concretos o a un rol; regla "cualquiera de" o "todos".
8. **PDF** del SOF generado al aprobarse (y descargable en cualquier momento).
9. **Correo** al aprobador de cada paso, al solicitante cuando se aprueba o rechaza, y recordatorio si un paso lleva más de N horas.
10. **Inventario básico:** un almacén por defecto, stock inicial importado, la entrega descuenta stock y registra movimientos.
11. **Auditoría** de acciones de admin y de cada decisión de aprobación.
12. **Responsive:** las pantallas 1–3 funcionan bien en el celular (sin app aparte).

### Queda fuera del MVP (pero el diseño lo permite)
| Funcionalidad | Cómo se deja preparado |
|---|---|
| Login con Microsoft | Puerto `AuthProvider`; `tenant_settings.login_methods` |
| Cadenas por monto, área o tipo | `approval_policies.conditions` (jsonb) + prioridad; el MVP usa una sola política |
| Aprobación de Hong Kong por link | `approver_type = 'external_email'` reservado; ruta `/api/v1/approvals/external` |
| PR/PD, cotizaciones con IA, órdenes de compra | `requests.doc_type` + módulos nuevos; la máquina de estados es por tipo |
| WhatsApp y Teams | Puerto `Notifier` con canales; `tenant_settings.notification_channels` |
| PDFs en SharePoint | Puerto `FileStorage`; hoy Supabase Storage |
| Varios almacenes | Tabla `warehouses`; el MVP crea uno por defecto |
| Roles personalizados | Mapa `ROLE_PERMISSIONS` → tablas cuando se necesite |
| Tablero y cierre diario | Datos en `stock_movements` y `approval_events` |
| Cobro de suscripciones | `subscriptions.status` se cambia a mano |

## 5. Criterios de éxito de la demo

1. Ruby crea un SOF con 3 ítems del catálogo y el total se calcula solo.
2. Jhony corrige el equipo de una línea y **las firmas previas se mantienen**, con el cambio visible en la línea de tiempo.
3. Sergio aprueba desde el celular con un clic desde el correo (link a la plataforma).
4. El PDF del SOF se descarga con número correlativo y todas las firmas.
5. Al registrar la entrega, el stock de esos productos baja.
6. Un usuario de otra empresa (tenant de prueba) no ve nada de Genrent.

## 6. Requisitos no funcionales

- **Multi-cliente estricto:** toda tabla de negocio tiene `tenant_id`; toda consulta filtra por él; RLS activado.
- **Idioma:** español (Perú). Textos en un archivo de mensajes para poder traducir después.
- **Moneda:** PEN por defecto; montos en `numeric`, nunca `float`.
- **Fechas:** se guardan en UTC; se muestran en la zona horaria del cliente (America/Lima).
- **Rendimiento:** bandeja < 1 s con 5,000 solicitudes.
- **Seguridad:** contraseñas solo en Supabase Auth; tokens de invitación guardados como hash; auditoría inmutable.
- **Accesibilidad:** controles reales (`button`, `label`), contraste AA, objetivos táctiles de 44 px.

## 7. Supuestos y pendientes con Genrent

Ver el correo de preguntas enviado (formatos, catálogo, equipos, usuarios, orden de firmas, numeración, moneda). Mientras no lleguen, se trabaja con datos de ejemplo del prototipo.
