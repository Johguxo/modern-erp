# ADR-002 – Login, roles, planes y consola de SuperAdmin

**Fecha:** 18 nov 2026 · **Estado:** aceptada (roles simplificados el 18 nov)

## 1. Login
- **MVP:** correo y contraseña con Supabase Auth, más invitación por correo y recuperación de contraseña.
- **Después:** login con Microsoft (Entra ID) como otro proveedor de Supabase Auth, activable por cliente.
- **Cómo se deja preparado:**
  - Puerto `AuthProvider` en `src/shared`. Los módulos nunca llaman a Supabase Auth directamente.
  - La tabla `users` tiene su propio `id`, separado de `auth_user_id`, así cambiar o sumar proveedores no toca el negocio.
  - `tenant_settings.login_methods` (`["password"]` → `["password","microsoft"]`) y `tenant_settings.email_domains` para enviar a cada usuario al login correcto.

## 2. Roles

**Principio:** los roles definen qué pantallas ve y qué acciones puede hacer cada usuario. **Quién aprueba qué** lo definen las políticas de aprobación (ver `docs/dominio/flujo-sof-aprobaciones.md`), que apuntan a personas concretas o a un rol.

### Plataforma (LinkUs)
| Rol | Puede |
|---|---|
| `super_admin` | Todo: clientes, planes, límites, configuración, suspender, ver como cliente |

Se guarda en `platform_admins`. Consola aparte: `/admin`.

### Cliente (tenant)
| Código | Etiqueta (es-PE) | Ve y hace |
|---|---|---|
| `admin` | Administrador | Todo dentro de su empresa: usuarios, catálogo, equipos, aprobaciones, configuración |
| `requester` | Solicitante | Crear sus solicitudes y ver su estado |
| `warehouse` | Almacén | Revisar stock, corregir líneas, registrar entregas |
| `approver` | Aprobador | Bandeja de aprobaciones y decidir en sus pasos |
| `purchasing` | Compras | *Fase 2:* cotizaciones y órdenes de compra |

- Un usuario puede tener **varios roles**: `memberships.roles` es un arreglo.
- Los roles se traducen a permisos en un **mapa fijo en el código** (`src/modules/identity/domain/permissions.ts`). Los casos de uso revisan **permisos**, nunca nombres de rol.
- Los tipos `Role` y `Permission` (las listas de esta sección) viven en `src/shared/permissions.ts`, porque `Ctx` los necesita y `shared` no puede depender de un módulo (ADR-005). El mapa rol → permisos sigue en `identity`.
- Las **etiquetas** visibles viven en el archivo de mensajes; se pueden sobreescribir por cliente en `tenant_settings.role_labels`.
- **Pospuesto:** roles personalizados (tablas `roles` y `role_permissions` con el mapa actual como plantilla), permisos por usuario, por sede o por almacén, rol de solo lectura y rol de soporte de plataforma.

### Permisos iniciales
| Permiso | admin | requester | warehouse | approver |
|---|---|---|---|---|
| `requests.create` | ✓ | ✓ | ✓ | |
| `requests.read_own` | ✓ | ✓ | ✓ | ✓ |
| `requests.read_all` | ✓ | | ✓ | ✓ |
| `requests.correct_line` | ✓ | | ✓ | |
| `requests.deliver` | ✓ | | ✓ | |
| `approvals.decide` | ✓ | | ✓ | ✓ |
| `catalog.manage` | ✓ | | ✓ | |
| `inventory.manage` | ✓ | | ✓ | |
| `users.manage` | ✓ | | | |
| `settings.manage` | ✓ | | | |
| `approval_policies.manage` | ✓ | | | |

`approvals.decide` solo permite decidir en los pasos donde el usuario es aprobador asignado.

## 3. Planes y límites
| Campo del plan | Ejemplo |
|---|---|
| `max_users` | 10 / 30 / null (ilimitado) |
| `max_warehouses` | 1 / varios |
| `features` | `sof`, `pr_pd`, `quotes_ai`, `whatsapp`, `dashboard`, `microsoft_login`, `external_approvals` |
| `storage_mb` | Espacio para PDFs y adjuntos |

- **`subscriptions`** une cliente y plan: `status` (`trial`, `active`, `past_due`, `suspended`, `cancelled`), fechas, precio acordado y **`overrides`** por cliente (por ejemplo, `{"max_users": 40}`).
- **Se hacen cumplir en los casos de uso** con un servicio `Entitlements`: invitar a un usuario revisa el límite; cada módulo revisa su `feature`; un cliente `suspended` o `cancelled` queda en solo lectura.
- El cobro no entra al MVP: el SuperAdmin cambia el estado a mano.

## 4. Configuración por cliente (`tenant_settings`)
- Marca: nombre, logo y color principal
- Moneda (`PEN`, `USD`), zona horaria (`America/Lima`) e idioma (`es-PE`)
- Numeración por tipo de documento: prefijo y siguiente número (`document_sequences`)
- Canales de aviso: `["email"]` en el MVP
- Integraciones: métodos de login, dominios de correo, carpeta de SharePoint (futuro)
- Etiquetas de roles (opcional)

## 5. Consola de SuperAdmin (`/admin`)
- **MVP:** listar y crear clientes, asignar plan y ajustes, invitar a su primer `admin`.
- **Después:** suspender o reactivar, ver uso, "ver como cliente" (con aviso visible y registro en auditoría).
- **Auditoría (`audit_events`) desde el MVP:** acciones de admin y decisiones de aprobación con quién, qué, cuándo, IP y navegador.

## 6. Contexto de cliente activo
- Tras el login, si el usuario tiene una sola membresía, entra directo; si tiene varias, elige empresa.
- La empresa activa se guarda en una cookie firmada (`active_tenant`); cada request reconstruye el `ctx` validando que la membresía exista y esté activa.
- Las rutas **no** llevan el slug del cliente en el MVP. Si se quiere subdominio (`genrent.linkus.pe`) después, solo cambia cómo se resuelve el `ctx`.
