# ADR-006 – Sesión y empresa activa

**Fecha:** 24 nov 2026 · **Estado:** aceptada

## Contexto
E1-H2 conecta el login real (Supabase Auth) con el `Ctx` de ADR-005 y el contexto de base de datos de ADR-004. Faltaba fijar cómo se valida la sesión, cómo se guarda la empresa activa, a dónde va el usuario tras entrar y cómo se ejecutan las acciones previas al `ctx`.

## Decisión
1. **Sesión de Supabase** (`@supabase/ssr`) en cookies, detrás del puerto `AuthProvider` (`src/shared/adapters/supabase-auth-provider.ts`). La sesión se valida siempre contra el servidor de Auth (`getUser()`), nunca solo con la cookie. Los errores de Auth no revelan si el correo existe: cualquier 4xx es "Correo o contraseña incorrectos".
2. **Proxy** (`src/proxy.ts`, runtime Node): fija `x-request-id`, refresca la sesión y protege las rutas. **Todo es privado** salvo `/login`, `/recuperar`, `/restablecer`, `/invitacion/*`, `/auth/*` y `/api/*` (`/api` no redirige: `route()` responde 401 en JSON). Sin `?next=` hasta que haya validación contra redirecciones abiertas.
3. **Empresa activa:** cookie `active_tenant` = `v1.<tenantId>.<HMAC-SHA256(SESSION_SECRET, auth_user_id + tenantId)>`, `httpOnly`, `sameSite=lax`, `secure` en https, 30 días. Atada al usuario de Auth; se verifica con `timingSafeEqual` y se borra al cerrar sesión. Aun así, **la membresía se valida en cada request**.
4. **Un solo camino tras el login:** `GET /auth/continuar` decide con `decideEntry`: una membresía activa → fija la cookie y va a `/bandeja`; varias → `/elegir-empresa`; ninguna y SuperAdmin → `/admin`; si no, cierra la sesión y vuelve a `/login` con el aviso de "sin acceso". Un tenant suspendido o cancelado **sí** entra, en solo lectura.
5. **Resolver del `Ctx`** (`src/app/_lib/session.ts`): usuario de Auth + cookie → `identity.resolveTenantSession`, con lecturas acotadas con la conexión dueño (ADR-004 §8) que valida usuario y membresía activos, calcula permisos con `permissionsFor` y el modo solo lectura con `Entitlements.isReadOnly`. `getSessionState` se cachea por request; `requireCtx()` y `requirePlatformAdmin()` (404 si no es SuperAdmin) protegen layouts y páginas.
6. **Solo lectura:** `Ctx.readOnly`. `action(..., { access })` bloquea las escrituras (`access: 'write'`, por defecto) con `FORBIDDEN` / `tenant_read_only`; `route()` trata GET y HEAD como lectura. El layout `(app)` muestra un aviso.
7. **Acciones previas al `ctx`:** `publicAction(contract, handler)` (login, recuperar, restablecer, elegir empresa, cerrar sesión): mismo `requestId`, validación Zod, mensajes es-PE y logs que `action()`, sin `ctx` ni transacción. La protección CSRF de las server actions la da Next. Sus casos de uso (`identity/application`) son una excepción documentada a "todo caso de uso recibe `ctx`".
8. **Recuperar contraseña con `token_hash`** (no PKCE): el enlace del correo (`/restablecer?token_hash=…`) funciona aunque se abra en otro navegador, y los escáneres de correo no lo consumen porque no hay un GET que lo canjee. La acción canjea el token, cambia la contraseña y cierra las demás sesiones. Política: 10 a 72 caracteres.
9. **Registro cerrado** (`enable_signup = false`): las cuentas solo se crean desde invitaciones (E1-H3, con la API admin).
10. **Aceptar invitación** (E1-H3, `/invitacion/[token]`, pública):
    - **Token:** 32 bytes aleatorios en base64url. Solo se guarda su sha256 (`token_hash`). Vence en 7 días y nunca va a logs, auditoría ni respuestas. La página usa `no-referrer` y `noindex`. Inválida, vencida y aceptada muestran el mismo mensaje.
    - **Tres casos**, que decide el servidor con la vista previa y vuelve a revisar al enviar (si cambió, `CONFLICT`):
      - **Cuenta nueva:** nombre y contraseña (10 a 72). La cuenta se crea con la API admin de Supabase (puerto `AuthAdmin`, service role solo en `src/shared/adapters/supabase-auth-admin.ts`) y el correo ya confirmado.
      - **Cuenta existente sin sesión:** su contraseña, con el correo fijo de la invitación.
      - **Sesión del mismo correo:** solo "Unirme".
    - **Escritura con `getDbAdmin`** (ADR-004 §8), acotada por `token_hash`. En una transacción:
      - bloquea la invitación (`for update`) y la vuelve a validar, así que de dos aceptaciones simultáneas solo gana una;
      - toma el bloqueo de cupos;
      - crea el usuario o le enlaza su `auth_user_id`;
      - crea la membresía o reactiva una desactivada (una activa conserva sus roles);
      - marca `accepted_at` y registra `invitation.accepted` con el invitado como actor.
    - **Compensación:** si la transacción falla después de crear la cuenta en Auth, se borra esa cuenta.
    - **Al final:** inicia sesión, fija `active_tenant` y va a `/bandeja`.
11. **Desactivar un miembro no revoca sus sesiones de Supabase.** La desactivación es por empresa y la cuenta puede seguir activa en otra. Supabase no permite cerrar las sesiones de un usuario por id sin bloquear la cuenta entera. El resolver del `Ctx` valida la membresía en cada request, así que la siguiente petición ya queda bloqueada.

## Consecuencias
- Cada request hace una validación con Auth (`getUser`) y dos lecturas acotadas en paralelo. Si la latencia molesta: `getClaims()` con claves JWT asimétricas y una caché corta.
- Producción necesita SMTP propio (Resend SMTP) con la plantilla `supabase/templates/recovery.html`, y subir el límite de intentos de Auth: todos los logins salen de la IP del servidor.
- Desactivar un usuario en todas las empresas (`users.status`) sí debería revocar sus sesiones: queda para la consola de SuperAdmin (E1-H4 o después). El resolver igual lo bloquea por `users.status`.
- Rotar `SESSION_SECRET` solo obliga a elegir empresa de nuevo.
