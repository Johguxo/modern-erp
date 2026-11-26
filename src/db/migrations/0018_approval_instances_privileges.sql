-- Grants de app_user para las tablas de instancias de aprobación (ADR-004 §11, E4-H2). La 0000 da
-- select/insert/update/delete por defecto: aquí se quita lo que la web no debe hacer. Ninguna de
-- estas tablas se borra: lo que se cierra cambia de estado.

-- Instancias: se crean al enviar o reenviar; después solo cambia el estado.
revoke update, delete on approval_instances from app_user;
--> statement-breakpoint
grant update (status, updated_at) on approval_instances to app_user;
--> statement-breakpoint

-- Pasos: la copia de la política no se edita; solo se decide (estado, quién, cuándo y comentario) o
-- pasa a pendiente (pending_since).
revoke update, delete on approval_steps from app_user;
--> statement-breakpoint
grant update (status, pending_since, decided_by, decided_at, comment, updated_at)
  on approval_steps to app_user;
--> statement-breakpoint

-- Asignados: la lista se fija al crear el paso; solo se registra la decisión de cada uno.
revoke update, delete on approval_step_assignees from app_user;
--> statement-breakpoint
grant update (decision, decided_at, comment) on approval_step_assignees to app_user;
--> statement-breakpoint

-- Eventos: solo insert y lectura (CLAUDE.md regla 7).
revoke update, delete on approval_events from app_user;
