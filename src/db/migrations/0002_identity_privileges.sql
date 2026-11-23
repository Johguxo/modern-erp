-- Grants de app_user para las tablas de identity (ADR-004 §11): la política RLS dice QUÉ FILAS;
-- estos grants dicen QUÉ OPERACIONES. La 0000 da select/insert/update/delete por defecto: aquí se
-- quita lo que la web no debe hacer. El resto de escrituras va por getDbAdmin() en casos de uso
-- acotados y auditados (E1-H2..H4).

-- Solo lectura para la web.
revoke insert, update, delete on plans, tenants, subscriptions, users from app_user;
--> statement-breakpoint

-- Configuración de la empresa: el admin la edita (E1-H5); se crea con el tenant (getDbAdmin).
revoke insert, delete on tenant_settings from app_user;
--> statement-breakpoint

-- Membresías: editar roles y desactivar (E1-H3); se crean al aceptar invitación (getDbAdmin).
revoke insert, delete on memberships from app_user;
--> statement-breakpoint

-- Invitaciones: crear y renovar (E1-H3); no se borran.
revoke delete on invitations from app_user;
--> statement-breakpoint

-- Auditoría: solo insert y select (CLAUDE.md regla 7).
revoke update, delete on audit_events from app_user;
--> statement-breakpoint

-- SuperAdmins: invisibles para la web.
revoke all on platform_admins from app_user;
