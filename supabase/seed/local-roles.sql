-- SOLO DESARROLLO LOCAL. Nunca se aplica en producción (allí el operador fija la contraseña una vez).
-- La CLI de Supabase ejecuta este archivo al crear la base local y en cada `supabase db reset`.
-- Da login a app_user con la contraseña de .env.example. La migración 0000 crea el rol sin login
-- y le da los permisos; aquí también se crea si falta, porque el seed corre antes que drizzle-kit.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin nobypassrls;
  end if;
end
$$;

alter role app_user with login password 'app_user_password';
