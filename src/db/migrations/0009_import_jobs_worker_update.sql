-- E2-H3: el worker procesa la importación con app_user dentro de withTenant (RLS), así el upsert del
-- catálogo y el cierre del job ocurren en una sola transacción. Solo las columnas que cambian; el
-- tenant, el tipo, quién lo creó y la fecha de creación no se modifican. Sigue sin DELETE.
grant update (status, summary, errors, payload, finished_at, updated_at) on import_jobs to app_user;
