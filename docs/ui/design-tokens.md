# Design tokens (del prototipo)

Marca **provisional** de LinkUs. Cuando llegue el logo y los colores oficiales, se cambian aquí y en `tailwind.config` / variables CSS; los componentes no llevan colores fijos.

## Tipografía
| Uso | Fuente | Peso | Tamaño |
|---|---|---|---|
| Títulos (h1, cifras grandes, logo) | Space Grotesk | 600–700 | 30 px (h1), 34 px (cifras) |
| Texto | Inter | 400 / 500 / 600 | 14 px base, 13 px secundario, 12 px etiquetas |

Cargar con `next/font/google`.

## Colores (variables CSS → Tailwind)
| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#0F172A` | Texto principal, menú lateral |
| `--ink-2` | `#1E293B` | Ítem activo del menú |
| `--bg` | `#F4F6F9` | Fondo de la app |
| `--surface` | `#FFFFFF` | Tarjetas, tablas |
| `--border` | `#E2E8F0` | Bordes de tarjetas |
| `--border-strong` | `#CBD5E1` | Bordes de inputs y botones secundarios |
| `--row-divider` | `#EEF2F6` | Separadores de filas |
| `--muted` | `#475569` | Texto secundario |
| `--muted-2` | `#64748B` | Notas al pie |
| `--primary` | `#0B5CD5` | Botón principal, links, pestaña activa |
| `--primary-hover` | `#0846A3` | |
| `--primary-soft` | `#EFF6FF` | Fondo de pestaña activa |
| `--brand-accent` | `#38BDF8` | Ícono del logo sobre fondo oscuro |
| `--success` | `#15803D` | Aprobar, cifras positivas |
| `--danger` | `#B91C1C` | Rechazar |
| `--warning-bg` / `--warning-border` / `--warning-text` | `#FFF7ED` / `#FDBA74` / `#7C2D12` | Aviso de línea corregida |

## Pastillas de estado (siempre con texto, nunca solo color)
| Estado | Fondo | Texto |
|---|---|---|
| Espera mi aprobación / Pendiente | `#FEF3C7` | `#92400E` |
| En aprobación | `#DBEAFE` | `#1E40AF` |
| Aprobada / Entregada | `#DCFCE7` | `#166534` |
| Espera aprobación externa | `#EDE9FE` | `#5B21B6` |
| Rechazada | `#FEE2E2` | `#991B1B` |
| Borrador / Anulada | `#F1F5F9` | `#334155` |

## Forma y espaciado
- Radio: 12 px tarjetas, 10 px botones principales, 8 px inputs y botones secundarios, 999 px pastillas.
- Espaciado: escala de 4 px; padding de contenido 32 px × 40 px en escritorio, 16 px en el celular.
- Alto mínimo de botones e inputs: 44 px (48 px en acciones principales).
- Menú lateral: 220–248 px de ancho, fondo `--ink`.

## Componentes shadcn a instalar
`button`, `input`, `label`, `select`, `textarea`, `table`, `tabs`, `badge`, `card`, `dialog`, `dropdown-menu`, `form`, `sonner` (toasts), `skeleton`, `separator`, `sheet` (menú móvil), `command` (buscador de catálogo), `tooltip`.

## Íconos
lucide-react. Logo provisional: ícono de eslabón (`link-2`) en `--brand-accent` + "LinkUs" en Space Grotesk 700.
