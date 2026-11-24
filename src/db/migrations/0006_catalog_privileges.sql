-- Grants de app_user para las tablas de catalog (ADR-004 §11) y almacén por defecto de los tenants
-- que ya existen. La 0000 da select/insert/update/delete por defecto: aquí se quita lo que la web
-- no debe hacer. Nada se borra: los registros se desactivan (active = false).

-- Almacenes: solo lectura para la web; el almacén por defecto lo crea el alta del tenant (getDbAdmin).
revoke insert, update, delete on warehouses from app_user;
--> statement-breakpoint

-- Productos, equipos y centros de costo: crear y editar (E2-H1), sin borrar. El código, el tenant,
-- el id y created_at no se modifican: un código mal escrito se corrige desactivando y creando otro.
revoke update, delete on products, equipment, cost_centers from app_user;
--> statement-breakpoint
grant update (name, unit, category, reference_price, currency, active, updated_at) on products to app_user;
--> statement-breakpoint
grant update (name, type, active, updated_at) on equipment to app_user;
--> statement-breakpoint
grant update (name, active, updated_at) on cost_centers to app_user;
--> statement-breakpoint

-- Trabajos de importación: crear y leer; el worker los actualiza con getDbAdmin (E2-H3).
revoke update, delete on import_jobs from app_user;
--> statement-breakpoint

-- Backfill idempotente: «Almacén principal» para los tenants existentes sin almacén por defecto.
insert into warehouses (tenant_id, code, name, is_default)
select t.id, 'PRINCIPAL', 'Almacén principal', true
from tenants t
where not exists (
  select 1 from warehouses w where w.tenant_id = t.id and (w.is_default or w.code = 'PRINCIPAL')
);
