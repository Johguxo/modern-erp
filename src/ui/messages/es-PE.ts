// Textos visibles de la interfaz (es-PE). Toda cadena que ve el usuario vive aquí.
import type { ErrorCode } from '@/shared/errors';

type Params = Readonly<Record<string, string | number>>;

export const messages = {
  app: {
    name: 'LinkUs',
    title: 'LinkUs · Plataforma de Compras y Almacén',
  },
  nav: {
    mainLabel: 'Menú principal',
    openMenu: 'Abrir menú',
    inbox: 'Bandeja',
  },
  admin: {
    consoleBanner: 'Consola LinkUs',
    title: 'Clientes',
    emptyTitle: 'Aún no hay clientes',
    emptyDescription: 'Aquí verás las empresas que usan la plataforma.',
  },
  auth: {
    signInTitle: 'Iniciar sesión',
    comingSoon: 'Disponible pronto.',
  },
  inbox: {
    title: 'Bandeja de solicitudes',
    emptyTitle: 'Aún no hay solicitudes',
    emptyDescription: 'Cuando crees o recibas solicitudes, aparecerán aquí.',
  },
  /** Pastillas de estado: siempre con texto (design-tokens.md). */
  status: {
    draft: 'Borrador',
    in_approval: 'En aprobación',
    changes_requested: 'Cambios solicitados',
    approved: 'Aprobada',
    delivered: 'Entregada',
    rejected: 'Rechazada',
    cancelled: 'Anulada',
    awaiting_my_approval: 'Espera mi aprobación',
    awaiting_external: 'Espera aprobación externa',
  },
  states: {
    loading: 'Cargando…',
    errorTitle: 'No pudimos cargar esta página',
    errorDescription: 'Inténtalo de nuevo. Si el problema sigue, comparte el código de referencia.',
    retry: 'Reintentar',
    notFoundTitle: 'Página no encontrada',
    notFoundDescription: 'No encontramos lo que buscas o no tienes acceso.',
    backToInbox: 'Ir a la bandeja',
  },
  dataTable: {
    previous: 'Anterior',
    next: 'Siguiente',
    page: (page: number, pageCount: number) => `Página ${page} de ${pageCount}`,
    noResults: 'Sin resultados.',
  },
  errors: {
    /** Mensaje general por código de error. */
    codes: {
      NOT_FOUND: 'No encontramos lo que buscas o no tienes acceso.',
      FORBIDDEN: 'No tienes permiso para realizar esta acción.',
      UNAUTHENTICATED: 'Tu sesión terminó. Vuelve a iniciar sesión.',
      VALIDATION: 'Revisa los datos marcados.',
      CONFLICT: 'Alguien modificó estos datos. Recarga la página e inténtalo de nuevo.',
      INVALID_TRANSITION: 'El documento cambió de estado. Recarga la página.',
      LIMIT_EXCEEDED: 'Alcanzaste el límite de tu plan.',
      BAD_REQUEST: 'La solicitud no es válida.',
      INTERNAL: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.',
    } satisfies Record<ErrorCode, string>,
    /** Mensajes específicos por `reason` (tienen prioridad sobre el del código). */
    reasons: {
      max_users: (p: Params) =>
        `Tu plan permite hasta ${p.max ?? '?'} usuarios. Pide al administrador ampliar el plan.`,
      stale_version: () => 'Alguien modificó este documento. Recarga la página.',
    } satisfies Record<string, (params: Params) => string>,
    reference: 'Código de referencia',
  },
  validation: {
    required: 'Este campo es obligatorio.',
    tooSmall: (min: number | bigint) => `Debe ser al menos ${min}.`,
    tooShort: (min: number | bigint) => `Debe tener al menos ${min} caracteres.`,
    tooBig: (max: number | bigint) => `Debe ser como máximo ${max}.`,
    tooLong: (max: number | bigint) => `Debe tener como máximo ${max} caracteres.`,
    greaterThan: (min: number | bigint) => `Debe ser mayor que ${min}.`,
    lessThan: (max: number | bigint) => `Debe ser menor que ${max}.`,
    atLeastOneItem: 'Agrega al menos un elemento.',
    minItems: (min: number | bigint) => `Agrega al menos ${min} elementos.`,
    maxItems: (max: number | bigint) => `Puedes agregar como máximo ${max} elementos.`,
    invalidFormat: 'El formato no es válido.',
    invalid: 'El valor no es válido.',
  },
} as const;

export type Messages = typeof messages;
