-- Planes de referencia (ADR-002 §3). Son datos que también necesita producción, por eso van en
-- una migración y no en `pnpm db:seed` (demo, E7). Valores provisionales; el precio va en cada
-- suscripción. Idempotente: no pisa cambios hechos después a mano.
insert into plans (code, name, max_users, max_warehouses, storage_mb, features)
values
  ('starter', 'Starter', 10, 1, 1024, '{sof}'),
  ('business', 'Business', 30, 3, 5120, '{sof,dashboard}'),
  ('enterprise', 'Enterprise', null, null, 20480, '{sof,dashboard,microsoft_login,external_approvals}')
on conflict (code) do nothing;
