# Flujo del SOF y motor de aprobaciones

**Versión:** 1.0 · **Fecha:** 19 nov 2026

El SOF (solicitud de almacén) es el primer tipo de documento. El motor de aprobaciones es **genérico**: sirve igual para PR/PD y órdenes de compra en la fase 2.

## 1. Estados del documento (`requests.status`)

| Estado | Significado |
|---|---|
| `draft` | Borrador; solo lo ve y edita el solicitante |
| `in_approval` | Enviado; recorriendo los pasos de aprobación |
| `changes_requested` | Un aprobador pidió cambios; vuelve al solicitante |
| `approved` | Todos los pasos aprobados; listo para entregar |
| `delivered` | Almacén registró la entrega; stock descontado |
| `rejected` | Un aprobador rechazó; estado final |
| `cancelled` | El solicitante o un admin lo anuló; estado final |

### Transiciones permitidas

| Desde | Acción | Hacia | Quién |
|---|---|---|---|
| `draft` | `submit` | `in_approval` | Solicitante (permiso `requests.create`) |
| `draft` | `cancel` | `cancelled` | Solicitante (solo su propio borrador: los borradores ajenos no se ven) |
| `in_approval` | último paso `approve` | `approved` | Aprobador del paso |
| `in_approval` | `reject` | `rejected` | Aprobador del paso actual |
| `in_approval` | `request_changes` | `changes_requested` | Aprobador del paso actual |
| `in_approval` | `correct_line` | `in_approval` (sin cambiar) | Almacén o admin |
| `in_approval` | `cancel` | `cancelled` | Solicitante o admin (`requests.cancel_any`) |
| `changes_requested` | `resubmit` | `in_approval` | Solicitante |
| `changes_requested` | `cancel` | `cancelled` | Solicitante o admin (`requests.cancel_any`) |
| `approved` | `correct_line` | `approved` o `in_approval` (ver §4) | Almacén o admin |
| `approved` | `deliver` | `delivered` | Almacén (permiso `requests.deliver`) |
| `approved` | `cancel` | `cancelled` | Admin (`requests.cancel_any`), si no se entregó |

Anular exige un comentario (1 a 500 caracteres) que se guarda en `requests.close_comment` junto con `closed_by` y `closed_at` (E3-H5); los pasos de aprobación pendientes se cierran (puerto `ApprovalCanceller`, que implementa E4-H2). Lo que nunca se envió (sin número, incluido un borrador anulado) solo lo ve su solicitante.

Cualquier otra transición es un error de dominio (`InvalidTransitionError`). La máquina de estados vive en `src/modules/requests/domain/request-state-machine.ts` y se prueba con todas las combinaciones.

## 2. Políticas de aprobación

Una **política** define los pasos para un tipo de documento. El MVP usa **una política activa por tipo**; el diseño ya admite varias, con condiciones.

```
approval_policies
  doc_type        'SOF'
  name            'SOF estándar'
  conditions      {}          ← futuro: {"min_amount": 5000, "cost_center_ids": [...]}
  priority        100         ← futuro: se elige la de mayor prioridad cuyas condiciones se cumplan
  active          true

approval_policy_steps (en orden)
  1. 'Almacén'          approver_type = 'role'  approver_ref = 'warehouse'   rule = 'any'
  2. 'Gerencia local'   approver_type = 'users' approver_ref = [ruby, sergio] rule = 'any'
  (futuro) 3. 'Hong Kong'  approver_type = 'external_email'  condition {"min_amount": X}
```

| `approver_type` | Significado | MVP |
|---|---|---|
| `users` | Lista de usuarios concretos | ✓ |
| `role` | Cualquier usuario con ese rol en el cliente | ✓ |
| `requester_manager` | Jefe del solicitante | Futuro |
| `external_email` | Persona sin cuenta; aprueba por link firmado | Futuro (reservado) |

| `rule` | Significado | MVP |
|---|---|---|
| `any` | Basta con que apruebe uno de los asignados | ✓ |
| `all` | Deben aprobar todos | ✓ |

Además, cada paso puede tener `condition` (jsonb) para saltarse si no aplica (por ejemplo, Hong Kong solo desde cierto monto). En el MVP el evaluador de condiciones soporta solo `min_amount`; condiciones desconocidas hacen que el paso **sí** aplique (falla segura).

## 3. Instancia de aprobación

Al hacer `submit`:
1. Se elige la política (`doc_type` + condiciones + prioridad).
2. Se crea una `approval_instance` con una **copia** de sus pasos en `approval_steps` (así, cambiar la política después no altera documentos en curso).
3. Se resuelven los aprobadores de cada paso en `approval_step_assignees` (para `role`, se toman los usuarios con ese rol en ese momento).
4. El primer paso aplicable queda `pending`; los demás `waiting`; los que no aplican, `skipped`.
5. Se encola el aviso por correo a los asignados del paso `pending`.

Estados de un paso: `waiting` → `pending` → `approved` | `rejected` | `changes_requested`; o `skipped`.

**Reglas:**
- Un usuario no puede aprobar su propia solicitud en ningún paso (si es el único asignado, el paso se marca `pending` y se avisa al admin). Configurable a futuro.
- Si un usuario está asignado a dos pasos seguidos, debe aprobar cada uno (sin aprobación automática) en el MVP.
- La decisión guarda `decided_by`, `decided_at`, `comment` y genera un evento en `approval_events`.
- Recordatorio: si un paso lleva `pending` más de `REMINDER_HOURS` (por defecto 24), el worker reenvía el aviso una vez al día.

## 4. Corrección de una línea sin reiniciar

Es el requisito diferencial del producto. Una corrección **nunca borra** firmas: crea una nueva **revisión** de la línea y registra el cambio.

### Qué se puede corregir
`equipment_id`, `quantity`, `product_id`, `unit_price`, `notes` de una línea; agregar o quitar una línea.

### Regla de reaprobación (MVP)

| Tipo de cambio | Efecto |
|---|---|
| No cambia el monto (equipo, notas, producto equivalente con mismo precio) | Las firmas se mantienen. Se registra el evento `line_corrected` con el antes y el después. Se avisa al solicitante y a quienes ya aprobaron (solo informativo). |
| Cambia el monto, pero el total **no sube** más de `reapproval_tolerance_pct` (por defecto 0 %) | Igual que el caso anterior. |
| El total **sube** por encima de la tolerancia | Los pasos ya aprobados quedan válidos para el resto del documento, pero se crea un **paso de reconfirmación** solo para la(s) línea(s) cambiada(s), asignado a quienes aprobaron los pasos posteriores al de almacén. Si el documento estaba `approved`, vuelve a `in_approval` hasta que reconfirmen. |

- La tolerancia es configurable por política (`approval_policies.settings.reapproval_tolerance_pct`).
- La interfaz muestra la línea corregida resaltada y el aviso "Línea N corregida por X. Solo esta línea vuelve a aprobación; las demás conservan sus firmas" (pantalla 3 del prototipo).
- El PDF muestra la revisión vigente de cada línea y una nota de revisión.

### Modelo
`request_lines` guarda la revisión vigente (`revision`, `status`). El historial completo va en `request_line_revisions` (copia de la línea antes del cambio + `changed_by`, `changed_at`, `reason`).

## 5. Entrega y stock

- `deliver` solo desde `approved`. Por cada línea activa crea un `stock_movement` tipo `delivery_out` y descuenta `stock_levels` en el almacén del documento, en **una sola transacción**.
- Si el stock no alcanza: el MVP **permite** la entrega dejando el stock negativo y marca una advertencia en el evento (Genrent aún no tiene inventario confiable). Configurable a futuro: `tenant_settings.inventory.allow_negative`.
- Entregas parciales: fuera del MVP (el estado `partially_delivered` queda reservado).

## 6. Línea de tiempo (`approval_events`)

Cada acción crea un evento inmutable: `created`, `submitted`, `step_pending`, `step_approved`, `step_rejected`, `changes_requested`, `resubmitted`, `line_corrected`, `reconfirmation_requested`, `approved`, `delivered`, `cancelled`, `reminder_sent`. La pantalla 3 dibuja la línea de tiempo a partir de estos eventos y de los pasos.

## 7. Numeración

- Al pasar de `draft` a `in_approval` se asigna el número (`SOF-0143`) desde `document_sequences` con bloqueo de fila (`SELECT ... FOR UPDATE`), para no repetir números con usuarios simultáneos.
- Los borradores no consumen número; se muestran como "Borrador".
- Prefijo y siguiente número se configuran por cliente (para continuar el correlativo de Genrent).

## 8. Casos borde a probar

1. Dos aprobadores con regla `any` aprueban al mismo tiempo → solo cuenta la primera decisión; la segunda recibe "ya fue decidido".
2. Un aprobador es desactivado con pasos pendientes → el paso queda visible para el admin, que puede reasignar.
3. Corrección mientras alguien está aprobando → se usa `requests.version` (bloqueo optimista); la acción que llega tarde recibe un error y la pantalla se recarga.
4. Se cambia la política con documentos en curso → los documentos en curso siguen con su copia.
5. Cliente suspendido → todo en solo lectura, sin errores 500.
6. Usuario de otro tenant intenta abrir `/solicitudes/<id>` → 404 (no 403, para no revelar existencia).
