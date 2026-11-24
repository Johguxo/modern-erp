# E1 · Identidad, acceso y SuperAdmin

Referencia: `docs/arquitectura/adr-002-identidad-roles-planes.md`, `docs/dominio/modelo-datos.md` (módulo `identity`).

### E1-H1 · Esquema de identidad
**Criterios de aceptación**
- [x] Tablas `plans`, `tenants`, `subscriptions`, `tenant_settings`, `users`, `memberships`, `invitations`, `platform_admins`, `audit_events` con restricciones, índices y RLS.
- [x] `permissions.ts` con `ROLE_PERMISSIONS` (tabla de ADR-002) y función `permissionsFor(roles)`; prueba unitaria de la tabla completa.
- [x] Servicio `Entitlements`: `canAddUser(tenantId)`, `hasFeature(tenantId, feature)`, `isReadOnly(tenantId)`, considerando `overrides`.
- [x] Seed de planes.

Estado: en revisión · Issue: [#8](https://github.com/Johguxo/modern-erp/issues/8)

### E1-H2 · Login con correo y contraseña
**Como** usuario **quiero** entrar con mi correo y contraseña **para** usar la plataforma de mi empresa.

**Criterios de aceptación**
- [x] Adaptador `AuthProvider` sobre Supabase Auth (`@supabase/ssr`): iniciar sesión, cerrar sesión, recuperar y restablecer contraseña.
- [x] `src/proxy.ts` (el middleware de Next.js 16) protege `(app)` y `admin`; redirige a `/login` sin sesión.
- [x] Al entrar: si tiene 1 membresía activa, entra directo; si tiene varias, `/elegir-empresa`; si tiene 0 y es SuperAdmin, `/admin`; si no, mensaje "Tu cuenta no tiene acceso a ninguna empresa".
- [x] Cookie firmada `active_tenant`; el `ctx` se reconstruye en cada request validando membresía activa y estado del tenant.
- [x] `CtxResolver` real (reemplaza `unconfiguredCtxResolver` de ADR-005): obtiene `users.id` y las membresías a partir de `auth_user_id` con **una lectura acotada con `getDbAdmin()`** (ADR-004 §8); el resto del request usa `withTenant`.
- [x] Modo solo lectura: el resolver calcula `readOnly` con `Entitlements.isReadOnly` (E1-H1); `action()` rechaza las escrituras con `FORBIDDEN` (`reason: tenant_read_only`) y el layout `(app)` muestra un aviso arriba (slot `banner` de `AppShell`).
- [x] Cliente: `configureZodMessages()` activo en los formularios y `applyActionError` para llevar `fieldErrors` a React Hook Form (ADR-005).
- [x] Mensajes de error en español sin revelar si el correo existe.
- [x] E2E: login correcto, contraseña errónea, cierre de sesión.

Estado: en revisión · Issue: [#9](https://github.com/Johguxo/modern-erp/issues/9)

### E1-H3 · Invitaciones y gestión de usuarios
**Como** admin del cliente **quiero** invitar usuarios y asignarles roles **para** que usen la plataforma.

**Criterios de aceptación**
- [x] `/configuracion/usuarios`: lista (nombre, correo, roles, estado), invitar, editar roles, desactivar.
- [x] Invitar respeta `Entitlements.canAddUser` (dentro de la transacción de invitar, con `pg_advisory_xact_lock(hashtext('seats:' || tenant_id))` para que dos invitaciones simultáneas no superen el límite: `app_user` no puede bloquear `tenants` ni `subscriptions` con `FOR UPDATE`); si no se puede, mensaje claro según `reason` (límite del plan, solo lectura o sin suscripción).
- [x] La invitación envía correo (puerto `Mailer`) con link `/invitacion/[token]` que vence en 7 días; el token se guarda como hash.
- [x] Adaptador `Mailer` mínimo: en local los correos se ven en Mailpit (http://127.0.0.1:54324); en producción, Resend con texto simple. Las plantillas con diseño (React Email) llegan en E5-H2.
- [x] Aceptar invitación: si el correo no tiene cuenta, crea contraseña; si ya tiene, solo agrega la membresía.
- [x] Un admin no puede quitarse a sí mismo el rol `admin` si es el último admin.
- [x] `invitations.invited_by` y el actor de `audit_events` se toman del `ctx`, nunca de lo que envía el cliente.
- [x] Cada acción queda en `audit_events`.

Estado: en revisión · Issue: [#10](https://github.com/Johguxo/modern-erp/issues/10)

### E1-H4 · Consola mínima de SuperAdmin
**Como** SuperAdmin de LinkUs **quiero** crear un cliente con su plan y su primer admin **para** activar nuevas empresas sin tocar la base de datos.

**Criterios de aceptación**
- [x] `/admin/clientes`: tabla con nombre, plan, estado de suscripción, usuarios activos / límite.
- [x] `/admin/clientes/nuevo`: nombre, slug, plan, ajustes (`max_users`), moneda, correo del primer admin. (El prefijo y el siguiente número de SOF se agregan en E3-H1.)
- [x] Caso de uso `platform.createTenant` en una transacción: tenant, settings, suscripción e invitación al primer admin. Las historias que crean tablas le agregan su paso: almacén por defecto (E2-H1), secuencia `SOF` (E3-H1) y política "SOF estándar" (E4-H1).
- [x] `/admin/clientes/[id]`: cambiar plan, estado de suscripción y ajustes.
- [x] Solo accesible para usuarios en `platform_admins`; auditoría de cada acción.

Estado: en revisión · Issue: [#11](https://github.com/Johguxo/modern-erp/issues/11)

### E1-H5 · Configuración de la empresa
**Criterios de aceptación**
- [x] `/configuracion/empresa`: nombre visible, logo (subida a `FileStorage`), color principal, moneda. (El prefijo y el siguiente número de SOF se agregan en E3-H1.)
- [x] El logo y el color se aplican en el menú lateral.

Estado: en revisión · Issue: [#12](https://github.com/Johguxo/modern-erp/issues/12)
