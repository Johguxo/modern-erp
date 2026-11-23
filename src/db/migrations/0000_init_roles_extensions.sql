-- Migración inicial (E0-H2, ADR-004): extensiones, rol app_user, funciones de contexto y permisos.
-- Escrita a mano (drizzle-kit generate --custom). Idempotente.

create schema if not exists extensions;
--> statement-breakpoint
create extension if not exists pgcrypto with schema extensions;
--> statement-breakpoint
create extension if not exists pg_trgm with schema extensions;
--> statement-breakpoint

-- Rol de la app web: sin login (cada entorno le da login aparte), sin bypassrls, no es dueño.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin nobypassrls;
  end if;
end
$$;
--> statement-breakpoint
alter role app_user set search_path = public, extensions;
--> statement-breakpoint
grant usage on schema public, extensions to app_user;
--> statement-breakpoint
revoke create on schema public from app_user;
--> statement-breakpoint

-- Funciones de contexto para las políticas RLS. Devuelven null si el valor falta o es ''
-- (una conexión reutilizada del pool, tras un `set local`, devuelve '' y no null).
create schema if not exists app;
--> statement-breakpoint
grant usage on schema app to app_user;
--> statement-breakpoint
create or replace function app.current_tenant_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
create or replace function app.current_user_id() returns uuid
  language sql stable parallel safe
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
revoke all on all functions in schema app from public;
--> statement-breakpoint
grant execute on all functions in schema app to app_user;
--> statement-breakpoint

-- Tablas y secuencias futuras de public creadas por el rol que migra: app_user puede usarlas
-- (las políticas RLS deciden qué filas). Las inmutables quitan update/delete en su migración.
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
--> statement-breakpoint
alter default privileges in schema public grant usage, select on sequences to app_user;
--> statement-breakpoint

-- No usamos la Data API de Supabase (PostgREST/GraphQL): sus roles no reciben nuestras tablas.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end
$$;
