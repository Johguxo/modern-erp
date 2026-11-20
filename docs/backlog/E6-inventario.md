# E6 · Inventario y entrega

Puede ir en paralelo con E5.

### E6-H1 · Stock y movimientos
**Criterios de aceptación**
- [ ] Tablas `stock_levels`, `stock_movements` con RLS; los movimientos son solo insert.
- [ ] Caso de uso `recordMovement` que inserta el movimiento y actualiza el saldo en la misma transacción (prueba de concurrencia).
- [ ] `searchProducts` (E2) muestra el stock del almacén por defecto.

Estado: pendiente

### E6-H2 · Stock inicial desde Excel
**Criterios de aceptación**
- [ ] `/configuracion/stock`: plantilla, subida, vista previa y confirmación (mismo patrón que E2-H3).
- [ ] Crea movimientos `initial`; si el producto no existe, la fila se marca con error.
- [ ] Tabla de stock actual con búsqueda.

Estado: pendiente

### E6-H3 · Registrar entrega
**Como** almacén **quiero** registrar la entrega de un SOF aprobado **para** que el stock se descuente solo.

**Criterios de aceptación**
- [ ] Botón "Registrar entrega" en la pantalla 3 (permiso `requests.deliver`, estado `approved`).
- [ ] En una transacción: movimientos `delivery_out` por línea activa, saldos actualizados, estado `delivered`, evento `delivered`.
- [ ] Si algún saldo queda negativo, se permite (configuración por defecto) y el evento guarda la advertencia; la interfaz la muestra antes de confirmar.
- [ ] E2E del flujo completo: crear → aprobar → entregar → ver el stock reducido.

Estado: pendiente
