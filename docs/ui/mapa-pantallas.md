# Mapa de pantallas → rutas → casos de uso

**Fuente visual:** `docs/ui/prototipo/*.dc.html` (prototipo de diseño, datos de ejemplo). Son archivos HTML con plantillas `{{...}}` y una clase `Component` al final con los datos y la interacción: úsalos como referencia de **estructura, textos, estados y estilos**, no como código a copiar. Los estilos se traducen a Tailwind con los tokens de `design-tokens.md`.

## Layouts

| Layout | Rutas | Contenido |
|---|---|---|
| `(auth)` | `/login`, `/recuperar`, `/restablecer`, `/invitacion/[token]`, `/elegir-empresa` | Tarjeta centrada con marca LinkUs. Tras el login, el route handler `GET /auth/continuar` decide el destino (ADR-006) |
| `(app)` | Todo lo del cliente | Menú lateral oscuro (prototipo: `nav` de `Main.dc.html`) + contenido. En el celular, el menú pasa a una barra superior con menú desplegable |
| `admin` | `/admin/*` | Consola de SuperAdmin; mismo estilo con una franja que dice "Consola LinkUs" |

## Pantallas del MVP

| # | Pantalla | Prototipo | Ruta | Permiso | Casos de uso |
|---|---|---|---|---|---|
| 1 | Bandeja de solicitudes | `Main.dc.html` | `/bandeja` (también `/` redirige aquí) | `requests.read_own` | `requests.listRequests({filter, page})`, `approvals.countPendingForUser()` |
| 2 | Nuevo SOF | `NuevoSOF.dc.html` | `/solicitudes/nueva` | `requests.create` | `catalog.searchProducts(q)`, `catalog.listEquipment()`, `catalog.listCostCenters()`, `requests.createDraft()`, `requests.updateDraft()`, `requests.submit()`, `approvals.previewRoute(docType, total)` |
| 2b | Editar borrador | `NuevoSOF.dc.html` | `/solicitudes/[id]/editar` | dueño del borrador | igual que 2 |
| 3 | Detalle del SOF | `DetalleSOF.dc.html` | `/solicitudes/[id]` | `requests.read_*` | `requests.getRequest(id)`, `approvals.getTimeline(requestId)`, `approvals.decide({stepId, decision, comment})`, `requests.correctLine()`, `requests.deliver()`, `requests.cancel()`, `documents.getPdfUrl(requestId)` |

### Administración del cliente (sin prototipo: usar el mismo lenguaje visual que la bandeja)

| Pantalla | Ruta | Permiso | Casos de uso |
|---|---|---|---|
| Usuarios | `/configuracion/usuarios` | `users.manage` | `identity.listMembers()`, `identity.inviteUser()`, `identity.updateMemberRoles()`, `identity.disableMember()` |
| Productos | `/configuracion/productos` | `catalog.manage` | `catalog.listProducts()`, `catalog.upsertProduct()`, `catalog.importProducts(file)` |
| Equipos | `/configuracion/equipos` | `catalog.manage` | `catalog.listEquipment()`, `catalog.upsertEquipment()`, `catalog.importEquipment(file)` |
| Centros de costo | `/configuracion/centros-de-costo` | `catalog.manage` | `catalog.upsertCostCenter()` |
| Stock inicial | `/configuracion/stock` | `inventory.manage` | `inventory.importInitialStock(file)`, `inventory.listStock()` |
| Aprobaciones | `/configuracion/aprobaciones` | `approval_policies.manage` | `approvals.getPolicy(docType)`, `approvals.updatePolicySteps()` |
| Empresa | `/configuracion/empresa` | `settings.manage` | `identity.getSettings()`, `identity.updateSettings()` (marca, numeración) |

### Consola SuperAdmin

| Pantalla | Ruta | Casos de uso |
|---|---|---|
| Clientes | `/admin/clientes` | `platform.listTenants()` |
| Nuevo cliente | `/admin/clientes/nuevo` | `platform.createTenant({name, slug, planCode, overrides, adminEmail})` (crea tenant, settings, suscripción, almacén por defecto, secuencias, política SOF estándar e invitación) |
| Detalle de cliente | `/admin/clientes/[id]` | `platform.getTenant()`, `platform.updateSubscription()` |

## Pantallas de fases siguientes (no implementar en el MVP)

| Pantalla | Prototipo | Ruta reservada |
|---|---|---|
| Comparación de cotizaciones con IA | `Cotizaciones.dc.html` | `/cotizaciones/[id]` |
| Tablero | `Tablero.dc.html` | `/tablero` |
| Correo de aprobación externa (Hong Kong) | `CorreoHK.dc.html` | Plantilla de correo + `/aprobacion-externa/[token]` |
| Aprobación móvil dedicada | `MovilAprobar.dc.html` | En el MVP, la pantalla 3 responsive cumple este rol |
| Notificación por WhatsApp | `MovilWhatsApp.dc.html` | Plantilla del canal WhatsApp |

## Estados de interfaz obligatorios en cada pantalla

- **Cargando:** esqueletos, no spinners de pantalla completa.
- **Vacío:** mensaje y acción principal (por ejemplo, "Aún no hay solicitudes · Crear la primera").
- **Error:** mensaje entendible y botón "Reintentar"; nunca el error técnico.
- **Sin permiso / no existe:** página 404 propia.
- **Solo lectura** (cliente suspendido): banner arriba y acciones deshabilitadas.
- Todo texto visible en español, desde el archivo de mensajes (`src/ui/messages/es-PE.ts`).

## Comportamiento clave por pantalla

**1. Bandeja**
- Pestañas: Todas · Esperan mi aprobación · En aprobación · Aprobadas (más Borradores y Rechazadas en un filtro "Más").
- Tarjetas de resumen con los conteos de las tres primeras pestañas.
- Tabla: N°, Tipo, Solicitante, Equipo/área, Monto, Estado (pastilla de color **con texto**), Actualizado. Clic en la fila abre el detalle.
- Búsqueda por número o texto; paginación del servidor (25 por página).

**2. Nuevo SOF**
- Datos generales: solicitante (fijo, el usuario actual), equipo, centro de costo, motivo.
- Buscador de catálogo con resultados en vivo (debounce de 250 ms): código, nombre, stock, precio, botón "Agregar". Agregar un producto que ya está suma 1 a la cantidad.
- Tabla de ítems editable: cantidad, equipo por línea (por defecto el de la cabecera), quitar; subtotal y total calculados en el cliente para la vista y **recalculados en el servidor** al guardar.
- Panel "Ruta de aprobación" con los pasos que aplicarán (`approvals.previewRoute`).
- Botones: "Enviar a aprobación" (valida que haya al menos 1 ítem) y "Guardar borrador".

**3. Detalle**
- Cabecera con número, motivo, solicitante, equipo, total y estado.
- Aviso naranja cuando hay líneas corregidas (texto del prototipo).
- Tabla de ítems con la línea corregida resaltada; botón "Corregir una línea" (solo con permiso) que abre un diálogo con los campos editables y un motivo obligatorio.
- Línea de tiempo vertical (eventos + pasos pendientes y futuros).
- Acciones según estado y permiso: Aprobar · Pedir cambios · Rechazar (con comentario obligatorio en rechazar y pedir cambios) · Registrar entrega · Anular · Descargar PDF.
