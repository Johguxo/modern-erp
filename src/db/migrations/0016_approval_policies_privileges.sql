-- Grants de app_user para las tablas de approvals (ADR-004 §11) y la política "SOF estándar" de los
-- tenants que ya existen. La 0000 da select/insert/update/delete por defecto: aquí se quita lo que
-- la web no debe hacer.

-- Políticas: la fila la crea el alta del cliente (getDbAdmin) o el backfill de abajo y nunca se
-- borra. La web solo sube la versión (bloqueo optimista) al guardar los pasos.
revoke insert, update, delete on approval_policies from app_user;
--> statement-breakpoint
grant update (version, updated_at) on approval_policies to app_user;
--> statement-breakpoint

-- Pasos: al guardar se borran todos y se insertan de nuevo; nunca se editan.
revoke update on approval_policy_steps from app_user;
--> statement-breakpoint

-- Backfill idempotente: política "SOF estándar" (Almacén → Gerencia local) para los tenants
-- existentes que aún no tienen una política SOF activa.
with new_policies as (
  insert into approval_policies (tenant_id, doc_type, name)
  select t.id, 'SOF', 'SOF estándar'
  from tenants t
  where not exists (
    select 1 from approval_policies p
    where p.tenant_id = t.id and p.doc_type = 'SOF' and p.active
  )
  returning id, tenant_id
)
insert into approval_policy_steps (tenant_id, policy_id, step_order, name, approver_type, approver_ref, rule)
select p.tenant_id, p.id, s.step_order, s.name, 'role', to_jsonb(s.role), 'any'
from new_policies p
cross join (values (1, 'Almacén', 'warehouse'), (2, 'Gerencia local', 'approver')) as s(step_order, name, role);
