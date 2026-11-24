// Textos visibles de la interfaz (es-PE). Toda cadena que ve el usuario vive aquí.
import type { ErrorCode } from '@/shared/errors';

type Params = Readonly<Record<string, string | number>>;

export const messages = {
  app: {
    name: 'LinkUs',
    title: 'LinkUs · Plataforma de Compras y Almacén',
  },
  common: {
    close: 'Cerrar',
    commandTitle: 'Buscar',
    commandDescription: 'Escribe para buscar.',
  },
  nav: {
    mainLabel: 'Menú principal',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
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
    signInSubmit: 'Ingresar',
    email: 'Correo',
    password: 'Contraseña',
    forgotPassword: '¿Olvidaste tu contraseña?',
    noAccess: 'Tu cuenta no tiene acceso a ninguna empresa. Pide una invitación al administrador.',
    recoverTitle: 'Recuperar contraseña',
    recoverDescription: 'Te enviaremos un enlace para crear una nueva contraseña.',
    recoverSubmit: 'Enviar enlace',
    recoverSent:
      'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    backToSignIn: 'Volver a iniciar sesión',
    resetTitle: 'Nueva contraseña',
    resetDescription: (min: number) => `Usa al menos ${min} caracteres.`,
    resetSubmit: 'Guardar contraseña',
    resetMissingToken: 'Abre el enlace que te enviamos por correo para restablecer tu contraseña.',
    chooseTenantTitle: 'Elige una empresa',
    chooseTenantDescription: 'Tienes acceso a varias empresas.',
    signOut: 'Cerrar sesión',
    signedInAs: 'Sesión iniciada como',
  },
  /** Correos en texto simple (E1-H3). Las plantillas con diseño (React Email) llegan en E5-H2. */
  emails: {
    invitation: {
      subject: (p: Params) => `Te invitaron a ${p.tenantName ?? 'LinkUs'} en LinkUs`,
      text: (p: Params) =>
        [
          'Hola:',
          '',
          `Te invitaron a usar LinkUs en ${p.tenantName ?? 'tu empresa'}.`,
          'Para aceptar la invitación, abre este enlace:',
          '',
          String(p.url ?? ''),
          '',
          `El enlace vence en ${p.expiresInDays ?? 7} días. Si no esperabas este correo, ignóralo.`,
          '',
          'LinkUs',
        ].join('\n'),
    },
  },
  readOnly: {
    banner:
      'Tu empresa está en modo solo lectura: puedes consultar, pero no crear ni modificar. Contacta al administrador de LinkUs.',
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
    pagination: 'Paginación',
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
      tenant_read_only: () =>
        'Tu empresa está en modo solo lectura. Contacta al administrador de LinkUs.',
      invalid_credentials: () => 'Correo o contraseña incorrectos.',
      too_many_attempts: () => 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
      reset_link_invalid: () =>
        'El enlace venció o ya se usó. Pide uno nuevo desde "¿Olvidaste tu contraseña?".',
      same_password: () =>
        'La nueva contraseña debe ser distinta de la anterior. Pide un enlace nuevo para intentarlo otra vez.',
      weak_password: () =>
        'Elige una contraseña más segura. Pide un enlace nuevo para intentarlo otra vez.',
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
