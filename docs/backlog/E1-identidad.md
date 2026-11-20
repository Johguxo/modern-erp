# E1 · Identidad, acceso y SuperAdmin

Referencia: `docs/arquitectura/adr-002-identidad-roles-planes.md`, `docs/dominio/modelo-datos.md` (módulo `identity`).

### E1-H1 · Esquema de identidad
**Criterios de aceptación**
- [ ] Tablas `plans`, `tenants`, `subscriptions`, `tenant_settings`, `users`, `memberships`, `invitations`, `platform_admins`, `audit_events` con restricciones, índices y RLS.
- [ ] `permissions.ts` con `ROLE_PERMISSIONS` (tabla de ADR-002) y función `permissionsFor(roles)`; prueba unitaria de la tabla completa.
- [ ] Servicio `Entitlements`: `canAddUser(tenantId)`, `hasFeature(tenantId, feature)`, `isReadOnly(tenantId)`, considerando `overrides`.
- [ ] Seed de planes.

Estado: pendiente · Issue: [#8](https://github.com/Johguxo/modern-erp/issues/8)

### E1-H2 · Login con correo y contraseña
**Como** usuario **quiero** entrar con mi correo y contraseña **para** usar la plataforma de mi empresa.

**Criterios de aceptación**
- [ ] Adaptador `AuthProvider` sobre Supabase Auth (`@supabase/ssr`): iniciar sesión, cerrar sesión, recuperar y restablecer contraseña.
- [ ] Middleware de Next.js que protege `(app)` y `admin`; redirige a `/login` sin sesión.
- [ ] Al entrar: si tiene 1 membresía activa, entra directo; si tiene varias, `/elegir-empresa`; si tiene 0 y es SuperAdmin, `/admin`; si no, mensaje "Tu cuenta no tiene acceso a ninguna empresa".
- [ ] Cookie firmada `active_tenant`; el `ctx` se reconstruye en cada request validando membresía activa y estado del tenant.
- [ ] Mensajes de error en español sin revelar si el correo existe.
- [ ] E2E: login correcto, contraseña errónea, cierre de sesión.

Estado: pendiente · Issue: [#9](https://github.com/Johguxo/modern-erp/issues/9)

### E1-H3 · Invitaciones y gestión de usuarios
**Como** admin del cliente **quiero** invitar usuarios y asignarles roles **para** que usen la plataforma.

**Criterios de aceptación**
- [ ] `/configuracion/usuarios`: lista (nombre, correo, roles, estado), invitar, editar roles, desactivar.
- [ ] Invitar respeta `Entitlements.canAddUser`; si se supera el límite, mensaje claro con el límite del plan.
- [ ] La invitación envía correo (puerto `Mailer`) con link `/invitacion/[token]` que vence en 7 días; el token se guarda como hash.
- [ ] Aceptar invitación: si el correo no tiene cuenta, crea contraseña; si ya tiene, solo agrega la membresía.
- [ ] Un admin no puede quitarse a sí mismo el rol `admin` si es el último admin.
- [ ] Cada acción queda en `audit_events`.

Estado: pendiente · Issue: [#10](https://github.com/Johguxo/modern-erp/issues/10)

### E1-H4 · Consola mínima de SuperAdmin
**Como** SuperAdmin de LinkUs **quiero** crear un cliente con su plan y su primer admin **para** activar nuevas empresas sin tocar la base de datos.

**Criterios de aceptación**
- [ ] `/admin/clientes`: tabla con nombre, plan, estado de suscripción, usuarios activos / límite.
- [ ] `/admin/clientes/nuevo`: nombre, slug, plan, ajustes (`max_users`), moneda, prefijo y siguiente número de SOF, correo del primer admin.
- [ ] Caso de uso `platform.createTenant` en una transacción: tenant, settings, suscripción, almacén por defecto, secuencia `SOF`, política "SOF estándar" (paso 1 "Almacén" con rol `warehouse`, paso 2 "Gerencia" con rol `approver`; el admin del cliente la ajusta después) e invitación.
- [ ] `/admin/clientes/[id]`: cambiar plan, estado de suscripción y ajustes.
- [ ] Solo accesible para usuarios en `platform_admins`; auditoría de cada acción.

Estado: pendiente · Issue: [#11](https://github.com/Johguxo/modern-erp/issues/11)

### E1-H5 · Configuración de la empresa
**Criterios de aceptación**
- [ ] `/configuracion/empresa`: nombre visible, logo (subida a `FileStorage`), color principal, moneda, prefijo y siguiente número de SOF.
- [ ] El logo y el color se aplican en el menú lateral.
- [ ] Cambiar el siguiente número no puede dejarlo por debajo del último usado.

Estado: pendiente · Issue: [#12](https://github.com/Johguxo/modern-erp/issues/12)
