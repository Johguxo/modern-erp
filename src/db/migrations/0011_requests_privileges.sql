-- Grants de app_user para las tablas de requests (ADR-004 §11) y la secuencia SOF de los tenants que
-- ya existen. La 0000 da select/insert/update/delete por defecto: aquí se quita lo que la web no
-- debe hacer.

-- Secuencias de numeración: la web solo lee y actualiza prefijo, siguiente número y último emitido.
-- La fila la crea el alta del cliente (getDbAdmin) o el backfill de abajo; nunca se borra.
revoke insert, update, delete on document_sequences from app_user;
--> statement-breakpoint
grant update (prefix, next_number, last_issued_number, updated_at) on document_sequences to app_user;
--> statement-breakpoint

-- Solicitudes: se crean y se editan por columnas; nunca se borran (se anulan).
revoke update, delete on requests from app_user;
--> statement-breakpoint
grant update (
  status, number, cost_center_id, warehouse_id, equipment_id, reason, total_amount,
  submitted_at, approved_at, delivered_at, closed_at, version, updated_at
) on requests to app_user;
--> statement-breakpoint

-- Líneas: se editan por columnas. El DELETE queda permitido a nivel de grant, pero la política
-- restrictiva request_lines_delete_only_draft solo lo deja pasar con la solicitud en borrador.
revoke update on request_lines from app_user;
--> statement-breakpoint
grant update (
  line_no, product_id, product_code_snapshot, description_snapshot, unit_snapshot, equipment_id,
  quantity, unit_price, subtotal, notes, status, revision, needs_reconfirmation, updated_at
) on request_lines to app_user;
--> statement-breakpoint

-- Revisiones de línea: solo insert y lectura (CLAUDE.md regla 7).
revoke update, delete on request_line_revisions from app_user;
--> statement-breakpoint

-- Backfill idempotente: secuencia SOF-0001 para los tenants existentes que aún no tienen una.
insert into document_sequences (tenant_id, doc_type, prefix, next_number, padding)
select t.id, 'SOF', 'SOF-', 1, 4
from tenants t
where not exists (
  select 1 from document_sequences s where s.tenant_id = t.id and s.doc_type = 'SOF'
);
