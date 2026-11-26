# ADR-008 – `requests` orquesta, `approvals` es el motor

**Fecha:** 26 nov 2026 · **Estado:** aceptada

## Contexto
E4-H2 conecta los módulos `requests` (documento SOF, estados, numeración, versión) y `approvals` (políticas, instancias, pasos, asignados, eventos). Enviar, decidir y anular tocan los dos: cambia el estado del documento y, en la misma transacción, la instancia de aprobación. ADR-001 §10 prohíbe que un módulo use otro salvo por su `index.ts`, y un ciclo `requests ↔ approvals` rompería esa regla.

## Decisión
1. **`requests` orquesta todas las transiciones del documento** (`submitRequest`, `decideRequest`, `cancelRequest`; después `correctLine` en E4-H4 y `deliver` en E6). Bloquea primero la solicitud (`FOR UPDATE`), revisa visibilidad, permisos y `version`, y cambia el estado con la máquina de estados.
2. **`requests` es dueño de los puertos** que necesita del motor: `ApprovalStarter`, `ApprovalDecider`, `ApprovalCanceller`, `ApprovalAssignments` y `ApprovalTimeline` (E4-H3; reemplazó al `ApprovalHistory` de E4-H2b).
3. **`approvals` los implementa por estructura** con `createApprovalEngine(tx, {clock, logger})`, sin importar `requests`. El motor trabaja sobre la misma transacción y bloquea la instancia después de la solicitud (orden fijo: solicitud → instancia → política `FOR SHARE`).
4. **La composición vive solo en `src/app/_lib/requests.ts`** (`requestsExtras(shared, tx)` y `readOnlyRequestsExtras(tx)`). Las fábricas de lectura exigen `assignments` explícito y el decisor por defecto falla (`approval_not_started`) en vez de fingir: olvidar la conexión no pasa en silencio.
5. **Auditoría y eventos:** `requests` escribe `audit_events` (`request.*`); el motor escribe `approval_events` (solo insert), que alimentan la línea de tiempo.

## Consecuencias
- Un solo sentido de dependencia (`app → requests`, `app → approvals`; `requests` y `approvals` no se importan entre sí).
- Las pruebas unitarias de `requests` usan fakes de los puertos; las de integración usan la misma composición que la entrega.
- Toda historia que agregue una transición nueva (corregir línea, entregar) sigue este patrón: caso de uso en `requests`, motor detrás de un puerto.
