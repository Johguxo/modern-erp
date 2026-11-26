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
    newRequest: 'Nueva solicitud',
    users: 'Usuarios',
    company: 'Empresa',
    catalog: 'Catálogo',
    approvals: 'Aprobaciones',
  },
  /** Etiquetas de los roles del cliente (ADR-002). */
  roles: {
    admin: 'Administrador',
    requester: 'Solicitante',
    warehouse: 'Almacén',
    approver: 'Aprobador',
    purchasing: 'Compras',
  },
  users: {
    title: 'Usuarios',
    description: 'Invita a tu equipo y define qué puede hacer cada persona.',
    seats: (used: number, limit: number | null) =>
      limit === null ? `${used} usuarios` : `${used} de ${limit} usuarios de tu plan`,
    invite: 'Invitar usuario',
    columns: {
      name: 'Nombre',
      email: 'Correo',
      roles: 'Roles',
      status: 'Estado',
      actions: 'Acciones',
    },
    you: 'Tú',
    editRoles: 'Editar roles',
    disable: 'Desactivar',
    reactivate: 'Reactivar',
    pendingTitle: 'Invitaciones pendientes',
    pendingEmpty: 'No hay invitaciones pendientes.',
    expires: (date: string) => `Vence: ${date}`,
    invitedBy: (name: string) => `Invitó: ${name}`,
    resend: 'Reenviar',
    cancelInvitation: 'Anular',
    inviteTitle: 'Invitar usuario',
    inviteDescription: 'Le enviaremos un correo con un enlace que vence en 7 días.',
    rolesLabel: 'Roles',
    inviteSubmit: 'Enviar invitación',
    save: 'Guardar',
    cancel: 'Cancelar',
    editRolesTitle: (name: string) => `Roles de ${name}`,
    disableTitle: (name: string) => `¿Desactivar a ${name}?`,
    disableDescription:
      'Ya no podrá entrar a esta empresa. Su cuenta sigue activa en otras empresas y podrás reactivarlo después.',
    notices: {
      invited: 'Invitación enviada.',
      emailFailed:
        'La invitación quedó guardada, pero no pudimos enviar el correo. Usa "Reenviar" para intentarlo de nuevo.',
      resent: 'Invitación reenviada.',
      cancelled: 'Invitación anulada.',
      rolesSaved: 'Roles actualizados.',
      disabled: 'Usuario desactivado.',
      reactivated: 'Usuario reactivado.',
    },
  },
  company: {
    title: 'Empresa',
    description: 'Cómo se ve tu empresa en la plataforma y la moneda de tus solicitudes.',
    detailsTitle: 'Datos de la empresa',
    displayName: 'Nombre visible',
    displayNameHint: (legalName: string) =>
      `Se muestra en el menú. Si lo dejas vacío, usamos el nombre registrado: ${legalName}.`,
    primaryColor: 'Color principal',
    primaryColorHint: 'Formato #RRGGBB. Se usa como acento en el menú. Vacío = color de LinkUs.',
    pickColor: 'Elegir color',
    currency: 'Moneda',
    currencyHint: 'Se usará en las nuevas solicitudes.',
    save: 'Guardar cambios',
    logoTitle: 'Logo',
    logoHint:
      'PNG, JPG o WebP de hasta 512 KB. Se muestra en el menú lateral, sobre fondo oscuro como en la vista previa: usa un logo claro o con fondo transparente.',
    logoCurrent: 'Logo actual',
    logoNone: 'Aún no hay logo: en el menú se muestran las iniciales.',
    logoChoose: 'Archivo del logo',
    logoUpload: 'Subir logo',
    logoRemove: 'Quitar logo',
    notices: {
      saved: 'Cambios guardados.',
      unchanged: 'No había cambios que guardar.',
      logoUploaded: 'Logo actualizado.',
      logoRemoved: 'Logo quitado.',
    },
  },
  /** Numeración de los documentos (E3-H1): alta del cliente, detalle en la consola y empresa. */
  sequence: {
    title: 'Numeración de SOF',
    description:
      'Prefijo y siguiente número de las solicitudes de almacén. Así se continúa el correlativo que ya usan.',
    prefix: 'Prefijo',
    prefixHint:
      'Incluye el separador, por ejemplo SOF-. Hasta 16 caracteres: letras mayúsculas, números y . _ / -',
    nextNumber: 'Siguiente número',
    nextNumberHint: (last: number | null) =>
      last === null
        ? 'Aún no se envió ninguna solicitud: puedes elegir cualquier número desde 1.'
        : `Último número usado: ${last}. El siguiente debe ser mayor.`,
    preview: (number: string) => `La próxima solicitud enviada saldrá como ${number}.`,
    save: 'Guardar numeración',
    notices: {
      saved: 'Numeración actualizada.',
      unchanged: 'No había cambios que guardar.',
    },
  },
  approvals: {
    title: 'Aprobaciones',
    description:
      'Define quién aprueba las solicitudes de almacén y en qué orden. Los cambios aplican a las solicitudes que se envíen desde ahora; las que ya están en aprobación conservan su ruta.',
    policyLabel: (name: string) => `Política · ${name}`,
    stepsLabel: 'Pasos de aprobación',
    stepTitle: (n: number) => `Paso ${n}`,
    empty:
      'Aún no hay pasos. Agrega al menos uno para que las solicitudes tengan quién las apruebe.',
    name: 'Nombre del paso',
    namePlaceholder: 'Por ejemplo, Almacén',
    approverType: 'Quién aprueba',
    approverTypes: { role: 'Cualquier usuario con un rol', users: 'Personas concretas' },
    role: 'Rol',
    rolePlaceholder: 'Elige un rol',
    rule: 'Cuántos deben aprobar',
    rules: { any: 'Basta con uno', all: 'Deben aprobar todos' },
    users: 'Aprobadores',
    usersSearch: 'Buscar usuario',
    usersEmpty: 'Nadie coincide con la búsqueda.',
    usersNone: 'Aún no elegiste a nadie.',
    inactiveTag: 'desactivado',
    removeUser: (name: string) => `Quitar a ${name}`,
    moveUp: 'Subir',
    moveDown: 'Bajar',
    remove: 'Quitar',
    moveUpStep: (n: number) => `Subir paso ${n}`,
    moveDownStep: (n: number) => `Bajar paso ${n}`,
    removeStep: (n: number) => `Quitar paso ${n}`,
    reservedSteps:
      'Esta política tiene pasos que esta pantalla no puede editar. Contacta al soporte de LinkUs.',
    stale: 'Alguien cambió la política mientras la editabas. Recarga la página.',
    addStep: 'Agregar paso',
    maxSteps: (max: number) => `Una política admite hasta ${max} pasos.`,
    save: 'Guardar cambios',
    saving: 'Guardando…',
    saved: 'Aprobaciones actualizadas.',
    warnings: {
      roleWithoutMembers: (role: string) =>
        `Ningún usuario activo tiene el rol ${role}: nadie podría aprobar este paso hasta que asignes ese rol a alguien.`,
      roleCannotDecide: (role: string) =>
        `El rol ${role} no puede aprobar solicitudes: nadie con ese rol podrá decidir este paso.`,
      usersCannotDecide: (names: string) =>
        `Estos usuarios no pueden aprobar solicitudes (${names}): no recibirán este paso. Cambia su rol o quítalos.`,
      inactiveUsers: (names: string) =>
        `Hay usuarios desactivados en este paso (${names}). No recibirán la solicitud; quítalos o reactívalos.`,
    },
  },
  catalog: {
    title: 'Catálogo',
    sectionsLabel: 'Secciones del catálogo',
    sections: {
      products: 'Productos',
      equipment: 'Equipos',
      costCenters: 'Centros de costo',
    },
    noValue: '—',
    search: 'Buscar',
    searchPlaceholder: 'Código o nombre',
    statusFilter: 'Estado',
    statusOptions: { all: 'Todos', active: 'Activos', inactive: 'Inactivos' },
    noResultsTitle: 'Sin resultados',
    noResultsDescription: 'Prueba con otro texto o cambia el filtro de estado.',
    import: 'Importar desde Excel',
    importer: {
      title: { products: 'Importar productos', equipment: 'Importar equipos' },
      description:
        'Descarga la plantilla, llénala y súbela. Revisamos el archivo y te mostramos el resultado antes de guardar nada.',
      downloadTemplate: 'Descargar plantilla',
      fileLabel: 'Archivo (.xlsx o .csv)',
      fileHint:
        'Hasta 2 MB y 5,000 filas. Se lee la primera hoja y la fila 1 debe ser el encabezado.',
      existingHint:
        'Si el código ya existe, se actualizan sus datos; si es nuevo, se crea. Los registros inactivos siguen inactivos (actívalos desde la lista).',
      review: 'Revisar archivo',
      reviewing: 'Revisando…',
      chooseAnother: 'Elegir otro archivo',
      confirm: 'Confirmar importación',
      confirming: 'Enviando…',
      cancel: 'Cancelar',
      close: 'Cerrar',
      chooseFile: 'Elige un archivo para continuar.',
      previewTitle: 'Vista previa',
      previewTotals: (total: number, valid: number, failed: number) =>
        `${total} ${total === 1 ? 'fila' : 'filas'} en el archivo: ${valid} ${valid === 1 ? 'válida' : 'válidas'} y ${failed} con error.`,
      previewShowing: (shown: number, total: number) =>
        shown < total
          ? `Se muestran las primeras ${shown} de ${total} filas.`
          : `Se muestran las ${total} filas.`,
      previewTableLabel: 'Primeras filas del archivo',
      rowColumn: 'Fila',
      errorsTitle: 'Errores encontrados',
      errorsHint:
        'Las filas con error no se importan. Corrige el archivo y súbelo de nuevo, o confirma para importar solo las filas válidas.',
      errorsMore: (count: number) => `y ${count} ${count === 1 ? 'error más' : 'errores más'}`,
      noValidRows: 'No hay filas válidas para importar.',
      queueFailed:
        'El archivo se guardó, pero no se pudo iniciar la importación. Vuelve a subirlo en unos minutos.',
      fields: {
        code: 'Código',
        name: 'Nombre',
        unit: 'Unidad',
        category: 'Categoría',
        price: 'Precio',
        currency: 'Moneda',
        type: 'Tipo',
      },
      rowReasons: {
        required: () => 'es obligatorio.',
        too_long: (p: Params) => `puede tener como máximo ${p.max ?? '?'} caracteres.`,
        invalid_code: () => 'solo admite letras, números y . _ / - (sin espacios).',
        invalid_price: () =>
          'usa punto decimal, hasta 4 decimales y sin separador de miles (por ejemplo 1250.50).',
        invalid_currency: () => 'debe ser PEN o USD.',
        price_required: () => 'ingresa el precio o quita la moneda.',
        duplicate_in_file: (p: Params) =>
          `el código ya aparece en la fila ${p.firstRow ?? '?'}; solo se importa la primera.`,
        invalid: () => 'el valor no es válido.',
      } satisfies Record<string, (params: Params) => string>,
      template: {
        fileName: { products: 'plantilla-productos', equipment: 'plantilla-equipos' },
        sheets: { products: 'Productos', equipment: 'Equipos', instructions: 'Instrucciones' },
        instructionsTitle: 'Cómo llenar la plantilla',
        common: [
          'Llena la hoja de datos a partir de la fila 2; la fila 1 es el encabezado y no se debe cambiar.',
          'Las columnas con asterisco (*) son obligatorias; el orden de las columnas no importa.',
          'Un código que ya existe actualiza ese registro; uno nuevo lo crea. Los registros inactivos siguen inactivos.',
          'El código solo admite letras, números y . _ / - ; se guarda en mayúsculas y no se puede cambiar después.',
          'Máximo 5,000 filas y 2 MB. Se lee solo la primera hoja.',
        ],
        products: [
          'Unidad: por ejemplo UND, KG o M.',
          'Precio: opcional, con punto decimal y hasta 4 decimales (1250.50). Sin separador de miles ni símbolo de moneda.',
          'Moneda: PEN o USD. Si pones precio y no moneda, se usa la moneda de tu empresa.',
        ],
        equipment: ['Tipo: opcional, por ejemplo Grúa o Camioneta.'],
      },
      job: {
        title: { products: 'Importación de productos', equipment: 'Importación de equipos' },
        back: 'Volver a la lista',
        startedAt: 'Iniciada:',
        pendingText: 'Estamos importando tu archivo. Esta página se actualiza sola.',
        stalledTitle: 'No se pudo iniciar la importación',
        stalledText:
          'Lleva más de 5 minutos sin comenzar. Vuelve a subir el archivo desde la lista; si sigue igual, contacta al administrador de LinkUs.',
        failedTitle: 'La importación no se completó',
        failureReasons: {
          not_allowed: 'Tu usuario ya no tiene permiso para importar en esta empresa.',
          tenant_read_only: 'Tu empresa está en modo solo lectura.',
          invalid_payload: 'No se pudo leer el contenido guardado. Vuelve a subir el archivo.',
          unexpected: 'Ocurrió un error inesperado. Vuelve a subir el archivo en unos minutos.',
        } satisfies Record<string, string>,
        cards: {
          created: 'Creados',
          updated: 'Actualizados',
          unchanged: 'Sin cambios',
          failed: 'Con error',
        },
        total: (total: number) => `${total} ${total === 1 ? 'fila' : 'filas'} en el archivo.`,
        errorsTitle: 'Filas con error',
        errorsTableLabel: 'Filas con error de la importación',
        errorsOmitted: (count: number) =>
          `y ${count} ${count === 1 ? 'error más' : 'errores más'} que no se muestran.`,
        columns: { row: 'Fila', code: 'Código', reason: 'Problema' },
        noErrors: 'Todas las filas se importaron sin problemas.',
      },
    },
    actions: {
      edit: 'Editar',
      activate: 'Activar',
      deactivate: 'Desactivar',
      cancel: 'Cancelar',
      save: 'Guardar',
    },
    deactivateTitle: (name: string) => `¿Desactivar ${name}?`,
    deactivateDescription:
      'Dejará de aparecer al crear solicitudes, pero las solicitudes existentes no cambian. Podrás activarlo de nuevo cuando quieras.',
    deactivateConfirm: 'Desactivar',
    codeHint: 'Se escribe una sola vez: después no se puede cambiar.',
    codeReadOnlyHint: 'El código no se puede cambiar.',
    notices: {
      created: 'Registro creado.',
      updated: 'Cambios guardados.',
      unchanged: 'No había cambios que guardar.',
      activated: 'Registro activado.',
      deactivated: 'Registro desactivado.',
    },
    columns: {
      code: 'Código',
      name: 'Nombre',
      unit: 'Unidad',
      category: 'Categoría',
      price: 'Precio de referencia',
      type: 'Tipo',
      status: 'Estado',
      actions: 'Acciones',
    },
    fields: {
      code: 'Código',
      name: 'Nombre',
      unit: 'Unidad',
      category: 'Categoría',
      price: 'Precio de referencia',
      priceHint: 'Opcional. Usa punto decimal, por ejemplo 12.50.',
      currency: 'Moneda',
      currencyPlaceholder: 'Sin moneda',
      type: 'Tipo',
      unitPlaceholder: 'Ej.: UND',
    },
    products: {
      title: 'Productos',
      description: 'Materiales y repuestos que se piden al almacén.',
      new: 'Nuevo producto',
      createTitle: 'Nuevo producto',
      editTitle: (code: string) => `Editar producto ${code}`,
      emptyTitle: 'Aún no hay productos',
      emptyDescription: 'Crea el primero o impórtalos desde Excel.',
    },
    equipment: {
      title: 'Equipos',
      description: 'Equipos a los que se asignan las solicitudes.',
      new: 'Nuevo equipo',
      createTitle: 'Nuevo equipo',
      editTitle: (code: string) => `Editar equipo ${code}`,
      emptyTitle: 'Aún no hay equipos',
      emptyDescription: 'Crea el primero o impórtalos desde Excel.',
    },
    costCenters: {
      title: 'Centros de costo',
      description: 'Centros de costo a los que se imputan las solicitudes.',
      new: 'Nuevo centro de costo',
      createTitle: 'Nuevo centro de costo',
      editTitle: (code: string) => `Editar centro de costo ${code}`,
      emptyTitle: 'Aún no hay centros de costo',
      emptyDescription: 'Crea el primero para poder imputar las solicitudes.',
    },
  },
  admin: {
    consoleBanner: 'Consola LinkUs',
    nav: { tenants: 'Clientes' },
    title: 'Clientes',
    description: 'Empresas que usan la plataforma, su plan y sus usuarios.',
    emptyTitle: 'Aún no hay clientes',
    emptyDescription: 'Crea el primero y enviaremos la invitación a su administrador.',
    newTenant: 'Nuevo cliente',
    createFirst: 'Crear el primero',
    back: 'Volver a clientes',
    columns: {
      name: 'Nombre',
      plan: 'Plan',
      status: 'Suscripción',
      users: 'Usuarios activos / límite',
    },
    noSubscription: 'Sin suscripción',
    unlimited: 'Sin límite',
    usage: (active: number, limit: number | null) =>
      limit === null ? `${active} / sin límite` : `${active} / ${limit}`,
    pendingInvitations: (count: number) =>
      count === 1 ? '+1 invitación pendiente' : `+${count} invitaciones pendientes`,
    form: {
      name: 'Nombre de la empresa',
      slug: 'Identificador (slug)',
      slugHint: 'Minúsculas, números y guiones. No se puede cambiar después.',
      plan: 'Plan',
      planOption: (name: string, maxUsers: number | null) =>
        maxUsers === null
          ? `${name} · usuarios ilimitados`
          : `${name} · hasta ${maxUsers} usuarios`,
      maxUsers: 'Límite de usuarios',
      maxUsersHint: 'Déjalo vacío para usar el límite del plan.',
      currency: 'Moneda',
      currencies: { PEN: 'Soles (PEN)', USD: 'Dólares (USD)' },
      adminEmail: 'Correo del primer administrador',
      adminEmailHint: 'Le enviaremos una invitación que vence en 7 días.',
      status: 'Estado de la suscripción',
      statusHint:
        'Suspendida o cancelada deja al cliente en solo lectura. Mientras siga cancelada, los cambios de plan y límite no se guardan: reactívala para cambiarlos.',
      create: 'Crear cliente',
      save: 'Guardar cambios',
      select: 'Selecciona',
    },
    newTitle: 'Nuevo cliente',
    newDescription: 'Crea la empresa, su suscripción y la invitación a su administrador.',
    detail: {
      subscriptionTitle: 'Suscripción',
      usersTitle: 'Usuarios',
      usage: (active: number, limit: number | null) =>
        limit === null
          ? `${active} usuarios activos (sin límite)`
          : `${active} de ${limit} usuarios activos`,
      invitationsTitle: 'Invitaciones pendientes',
      invitationsEmpty: 'No hay invitaciones pendientes.',
      expires: (date: string) => `Vence: ${date}`,
      expired: 'Vencida',
      inviteTitle: 'Invitar administrador',
      inviteDescription:
        'Si el administrador no recibió el correo o el correo estaba mal, envía una invitación nueva. Al mismo correo se renueva la anterior.',
      inviteSubmit: 'Enviar invitación',
      currency: (currency: string) => `Moneda: ${currency}`,
    },
    notices: {
      created: 'Cliente creado. Enviamos la invitación a su administrador.',
      createdEmailFailed:
        'Cliente creado, pero no pudimos enviar el correo. Reenvía la invitación desde aquí.',
      saved: 'Suscripción actualizada.',
      unchanged: 'No había cambios que guardar.',
      invited: 'Invitación enviada.',
      emailFailed:
        'La invitación quedó guardada, pero no pudimos enviar el correo. Inténtalo de nuevo.',
    },
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
  invitation: {
    title: (tenantName: string) => `Únete a ${tenantName}`,
    invitedEmail: (email: string) => `Invitación para ${email}.`,
    invalidTitle: 'Invitación no válida',
    newAccountHint: (min: number) =>
      `Completa tu nombre y crea una contraseña de al menos ${min} caracteres.`,
    fullName: 'Nombre completo',
    passwordHint: 'Ya tienes una cuenta en LinkUs. Ingresa tu contraseña para unirte.',
    sessionHint: (email: string) => `Sesión iniciada como ${email}.`,
    submitNewAccount: 'Crear cuenta y unirme',
    submitJoin: 'Unirme',
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
  /** Bandeja de solicitudes (E3-H3). */
  inbox: {
    title: 'Bandeja de solicitudes',
    greeting: (name: string | null) => (name ? `Hola, ${name}` : 'Hola'),
    emptyTitle: 'Aún no hay solicitudes',
    emptyDescription: 'Cuando crees o recibas solicitudes, aparecerán aquí.',
    emptyAction: 'Crear la primera',
    newRequest: '+ Nueva solicitud',
    summaryLabel: 'Resumen',
    cards: {
      awaitingMe: 'Esperan mi aprobación',
      inApproval: 'En aprobación',
      approvedThisWeek: 'Aprobadas esta semana',
    },
    tabsLabel: 'Filtrar por estado',
    tabs: {
      all: 'Todas',
      awaiting_me: 'Esperan mi aprobación',
      in_approval: 'En aprobación',
      approved: 'Aprobadas',
      draft: 'Borradores',
      rejected: 'Rechazadas',
    },
    more: 'Más',
    search: 'Buscar por número o motivo',
    searchPlaceholder: 'Número o motivo de la solicitud',
    listLabel: 'Solicitudes',
    columns: {
      number: 'N°',
      type: 'Tipo',
      requester: 'Solicitante',
      area: 'Equipo / área',
      amount: 'Monto est.',
      status: 'Estado',
      updated: 'Actualizado',
    },
    draftNumber: 'Borrador',
    noValue: '—',
    noResultsTitle: 'No hay solicitudes con este filtro',
    noResultsDescription: 'Prueba con otra búsqueda o cambia de pestaña.',
  },
  /** Solicitudes (SOF): editor de borradores y detalle provisional (E3-H2). */
  requests: {
    breadcrumbLabel: 'Ruta de navegación',
    breadcrumbInbox: 'Bandeja',
    breadcrumbNew: 'Nueva solicitud',
    breadcrumbEdit: 'Editar borrador',
    breadcrumbEditRequest: 'Editar solicitud',
    title: 'Solicitud de almacén (SOF)',
    description: 'Un solo formulario: reemplaza el pre-SOF en Excel y la conversión manual.',
    general: {
      title: 'Datos generales',
      requester: 'Solicitante',
      equipment: 'Equipo / motor',
      noEquipment: 'Sin equipo',
      costCenter: 'Centro de costo',
      costCenterPlaceholder: 'Elige un centro de costo',
      reason: 'Motivo',
      reasonPlaceholder: 'Por ejemplo: mantenimiento de 500 horas',
      unavailable: 'No disponible',
    },
    catalog: {
      title: 'Agregar desde el catálogo',
      search: 'Buscar por código o nombre',
      searchPlaceholder: 'Código o nombre del producto',
      add: 'Agregar',
      addItem: (code: string, name: string) => `Agregar ${code} ${name}`,
      stock: 'Stock: —',
      noPrice: 'Sin precio',
      otherCurrency: 'Otra moneda',
      cannotAdd: (code: string) => `${code} no se puede agregar: otra moneda`,
      searching: 'Buscando…',
      empty: 'No encontramos productos con esa búsqueda.',
      error: 'No pudimos buscar en el catálogo. Inténtalo de nuevo.',
      results: 'Resultados del catálogo',
    },
    items: {
      title: 'Ítems de la solicitud',
      columns: {
        code: 'Código',
        description: 'Descripción',
        equipment: 'Equipo',
        quantity: 'Cant.',
        subtotal: 'Subtotal',
        actions: 'Acciones',
      },
      empty: 'Aún no agregaste ítems. Búscalos en el catálogo y presiona «Agregar».',
      quantityOf: (code: string) => `Cantidad de ${code}`,
      equipmentOf: (code: string) => `Equipo de ${code}`,
      removeItem: (code: string) => `Quitar ${code}`,
      remove: 'Quitar',
      unitPrice: (price: string) => `${price} c/u`,
      total: 'Total estimado (precio referencial automático)',
      totalUnavailable: '—',
    },
    route: {
      title: 'Ruta de aprobación',
      description: 'Se asigna sola según el tipo y el monto.',
      requester: (email: string) => `Solicitante · ${email}`,
      ruleAny: (role: string) => `Cualquier persona con el rol ${role}`,
      ruleAll: (role: string) => `Todas las personas con el rol ${role}`,
      usersAny: 'Cualquiera de las personas designadas',
      usersAll: 'Todas las personas designadas',
      updating: 'Actualizando la ruta…',
      updateError: 'No pudimos actualizar la ruta de aprobación.',
      notice: 'Cada aprobador recibe un aviso por correo.',
      noPolicy:
        'Tu empresa aún no tiene una ruta de aprobación. Pide al administrador que la configure.',
    },
    actions: {
      submit: 'Enviar a aprobación',
      submitting: 'Enviando…',
      saveDraft: 'Guardar borrador',
      saveChanges: 'Guardar cambios',
      resubmit: 'Reenviar a aprobación',
      resubmitting: 'Reenviando…',
      saving: 'Guardando…',
      reload: 'Recargar',
    },
    notices: {
      saved: 'Borrador guardado.',
      changesSaved: 'Cambios guardados.',
    },
    validation: {
      costCenterRequired: 'Elige un centro de costo.',
      reasonRequired: 'Escribe el motivo de la solicitud.',
      linesRequired: 'Agrega al menos un ítem.',
    },
    /** Detalle del SOF (E3-H4): lectura, línea de tiempo y acciones. */
    detail: {
      title: (number: string | null, reason: string | null) =>
        `${number ?? 'Borrador'}${reason ? ` · ${reason}` : ''}`,
      breadcrumbLabel: 'Ruta de navegación',
      breadcrumbInbox: 'Bandeja',
      draftNumber: 'Borrador',
      totalOf: (amount: string) => `Total ${amount}`,
      submittedNotice: (number: string) => `Enviaste ${number} a aprobación.`,
      decidedNotice: {
        approved: (number: string | null) =>
          `Aprobaste ${number ?? 'la solicitud'}. Quedó aprobada.`,
        advanced: (number: string | null) =>
          `Aprobaste ${number ?? 'la solicitud'}. Pasa al siguiente paso de aprobación.`,
        partial: (number: string | null) =>
          `Aprobaste ${number ?? 'la solicitud'}. Faltan otros aprobadores de este paso.`,
        rejected: (number: string | null) => `Rechazaste ${number ?? 'la solicitud'}.`,
        changes_requested: (number: string | null) =>
          `Pediste cambios en ${number ?? 'la solicitud'}.`,
      },
      resubmittedNotice: (number: string | null) =>
        `Reenviaste ${number ?? 'la solicitud'} a aprobación.`,
      cancelledNotice: (number: string | null) =>
        number === null ? 'Anulaste el borrador.' : `Anulaste ${number}.`,
      noValue: '—',
      items: {
        title: 'Ítems',
        columns: {
          number: '#',
          code: 'Código',
          description: 'Descripción',
          equipment: 'Equipo',
          quantity: 'Cant.',
          subtotal: 'Subtotal',
        },
        empty: 'Esta solicitud no tiene ítems.',
        quantityWithUnit: (quantity: string, unit: string) => `${quantity} ${unit}`,
        total: 'Total estimado',
      },
      document: {
        title: 'Documento',
        fileName: (number: string | null) => `${number ?? 'Borrador'}.pdf`,
        hint: 'Se genera al aprobarse y se puede descargar en cualquier momento.',
      },
      timeline: {
        title: 'Línea de tiempo',
        steps: {
          created: 'Solicitud creada',
          submitted: 'Enviada a aprobación',
          resubmitted: 'Reenviada a aprobación',
          step_approved: 'Paso aprobado',
          changes_requested: 'Se pidieron cambios',
          approval: 'Aprobación',
          approved: 'Aprobada',
          delivery: 'Entrega en almacén',
          rejected: 'Rechazada',
          cancelled: 'Anulada',
        },
        /** «Aprobado por Almacén»: el nombre del paso es el que escribió el administrador. */
        approvedBy: (stepName: string) => `Aprobado por ${stepName}`,
        hints: {
          approvalPending: 'Esperando la decisión de los aprobadores.',
          approvalUpcoming: 'Empieza cuando se envía a aprobación.',
          deliveryUpcoming: 'Descuenta stock automáticamente.',
          stepWaiting: 'Sigue cuando se apruebe el paso anterior.',
          noApprovers: 'Sin aprobadores asignados',
          /** Tras «Ruby o Sergio ·»; la fecha va después. */
          pendingSince: 'pendiente desde',
        },
        /** Comentario de la anulación, en el paso «Anulada». */
        commentLabel: 'Comentario',
        /** Texto solo para lectores de pantalla: el estado de cada paso. */
        states: {
          done: 'Completado',
          pending: 'Pendiente',
          upcoming: 'Próximo',
          stopped: 'Detenido',
        },
      },
      actions: {
        label: 'Acciones',
        decisionLabel: 'Decidir',
        edit_draft: 'Editar borrador',
        edit_request: 'Editar solicitud',
        resubmit: 'Reenviar a aprobación',
        cancel: 'Anular',
        approve: 'Aprobar',
        request_changes: 'Pedir cambio',
        reject: 'Rechazar',
        correct_line: 'Corregir una línea',
        deliver: 'Registrar entrega',
        download_pdf: 'Descargar PDF',
        soon: 'Esta acción se habilita pronto.',
      },
      /** Diálogo de decisión del aprobador (E4-H2). */
      decision: {
        approve: {
          title: (number: string | null) => `Aprobar ${number ?? 'la solicitud'}`,
          description: 'Tu aprobación queda en la línea de tiempo. Puedes dejar un comentario.',
          commentLabel: 'Comentario (opcional)',
          commentPlaceholder: 'Por ejemplo: aprobado con la condición acordada',
          submit: 'Aprobar',
          submitting: 'Aprobando…',
        },
        request_changes: {
          title: (number: string | null) => `Pedir cambios en ${number ?? 'la solicitud'}`,
          description:
            'El solicitante podrá editar la solicitud y reenviarla. Tu comentario le explica qué cambiar.',
          commentLabel: 'Comentario (obligatorio)',
          commentPlaceholder: 'Cuenta qué hay que cambiar',
          submit: 'Pedir cambios',
          submitting: 'Enviando…',
        },
        reject: {
          title: (number: string | null) => `Rechazar ${number ?? 'la solicitud'}`,
          description:
            'El rechazo cierra la solicitud y no se puede deshacer. El comentario lo ve quien tenga acceso al documento.',
          commentLabel: 'Comentario (obligatorio)',
          commentPlaceholder: 'Cuenta por qué se rechaza esta solicitud',
          submit: 'Rechazar solicitud',
          submitting: 'Rechazando…',
        },
        counter: (used: number, max: number) => `${used} / ${max}`,
        remaining: (left: number) =>
          left < 0
            ? `Te pasaste por ${-left} ${left === -1 ? 'carácter' : 'caracteres'}`
            : `Quedan ${left} ${left === 1 ? 'carácter' : 'caracteres'}`,
        back: 'Volver',
        reload: 'Recargar',
      },
      cancel: {
        title: (number: string | null) => (number ? `Anular ${number}` : 'Anular borrador'),
        description:
          'La anulación no se puede deshacer. El comentario queda en la línea de tiempo y lo ve quien tenga acceso al documento.',
        commentLabel: 'Comentario (obligatorio)',
        commentPlaceholder: 'Cuenta por qué se anula esta solicitud',
        counter: (used: number, max: number) => `${used} / ${max}`,
        // Aviso para lectores de pantalla: solo cuando quedan pocos caracteres o se pasó.
        remaining: (left: number) =>
          left < 0
            ? `Te pasaste por ${-left} ${left === -1 ? 'carácter' : 'caracteres'}`
            : `Quedan ${left} ${left === 1 ? 'carácter' : 'caracteres'}`,
        submit: 'Anular solicitud',
        submitting: 'Anulando…',
        back: 'Volver',
        reload: 'Recargar',
      },
    },
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
    user_active: 'Activo',
    user_disabled: 'Desactivado',
    catalog_active: 'Activo',
    catalog_inactive: 'Inactivo',
    subscription_trial: 'Prueba',
    subscription_active: 'Activa',
    subscription_past_due: 'Pago pendiente',
    subscription_suspended: 'Suspendida',
    subscription_cancelled: 'Cancelada',
    subscription_none: 'Sin suscripción',
    import_pending: 'En cola',
    import_processing: 'Procesando',
    import_completed: 'Terminada',
    import_failed: 'Con fallas',
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
      price_required: () => 'Ingresa el precio de referencia o quita la moneda.',
      currency_required: () => 'Elige la moneda del precio de referencia.',
      code_taken: (p: Params) =>
        `Ya existe un registro con el código ${p.code ?? ''}. Usa otro código o busca el existente.`,
      policy_without_steps: () => 'Agrega al menos un paso de aprobación.',
      step_without_approvers: () => 'Elige quién aprueba este paso.',
      approver_not_member: () =>
        'Hay personas que ya no son usuarios activos de tu empresa. Quítalas del paso.',
      stale_version: () => 'Alguien modificó este documento. Recarga la página.',
      duplicated_approver: () => 'Un aprobador está repetido en este paso.',
      policy_has_reserved_steps: () =>
        'Esta política tiene pasos que esta pantalla no puede editar. Contacta al soporte de LinkUs.',
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
      password_rejected: () => 'Elige una contraseña más segura.',
      no_subscription: () =>
        'Tu empresa no tiene una suscripción vigente. Contacta al administrador de LinkUs.',
      already_member: () => 'Este correo ya pertenece a un usuario activo de tu empresa.',
      last_admin: () =>
        'La empresa debe tener al menos un administrador activo. Asigna otro administrador antes de hacer este cambio.',
      cannot_disable_self: () => 'No puedes desactivar tu propio usuario.',
      invitation_invalid: () =>
        'La invitación no es válida o ya venció. Pide al administrador que te envíe una nueva.',
      // Cuenta en Auth sin usuario de la plataforma: recargar vuelve al mismo formulario, así que
      // se le lleva a recuperar la contraseña (con la sesión de ese correo, el enlace solo une).
      email_in_use: () =>
        'Ya existe una cuenta con este correo. Recupera tu contraseña desde "¿Olvidaste tu contraseña?", inicia sesión y vuelve a abrir este enlace de invitación.',
      logo_invalid_type: () => 'El logo debe ser una imagen PNG, JPG o WebP.',
      logo_too_large: () => 'El logo pesa más de 512 KB. Usa una imagen más liviana.',
      slug_taken: () => 'Ya existe un cliente con este identificador. Elige otro.',
      slug_reserved: () => 'Este identificador está reservado. Elige otro.',
      plan_unavailable: () => 'El plan elegido no está disponible.',
      tenant_seats_full: (p: Params) =>
        `El cliente alcanzó su límite de ${p.max ?? '?'} usuarios. Sube el límite en la suscripción.`,
      tenant_inactive: () =>
        'El cliente está en solo lectura o sin suscripción vigente. Reactiva su suscripción primero.',
      // Solicitudes (E3-H1).
      request_incomplete: () =>
        'Completa el centro de costo, el motivo y al menos un ítem para enviar la solicitud.',
      cancel_not_allowed: () => 'No puedes anular esta solicitud en su estado actual.',
      cancel_comment_required: () => 'Escribe el motivo de la anulación.',
      cancel_comment_too_long: (p: Params) =>
        `El comentario puede tener hasta ${p.max ?? '?'} caracteres.`,
      request_not_editable: () =>
        'Esta solicitud ya no se puede editar porque salió de borrador. Recarga la página.',
      quantity_invalid: () => 'Ingresa una cantidad mayor que cero, con hasta 3 decimales.',
      product_not_available: () => 'Este producto ya no está disponible en el catálogo.',
      product_currency_mismatch: () =>
        'El precio de este producto está en otra moneda que la de tu empresa.',
      equipment_not_available: () => 'Este equipo ya no está disponible en el catálogo.',
      cost_center_not_available: () => 'Este centro de costo ya no está disponible.',
      too_many_lines: (p: Params) =>
        `Una solicitud admite hasta ${p.max ?? '?'} ítems. Divide el pedido en varias solicitudes.`,
      amount_too_large: () =>
        'El monto de la solicitud es demasiado grande. Reduce las cantidades.',
      sequence_below_last_used: (p: Params) =>
        `El siguiente número debe ser mayor que el último usado (${p.last ?? '?'}).`,
      number_taken: () =>
        'Este número ya fue usado. Pide al administrador revisar la numeración de SOF.',
      sequence_exhausted: () => 'La numeración llegó a su límite. Contacta a LinkUs.',
      // Aprobaciones (E4-H2).
      approval_policy_missing: () =>
        'Tu empresa no tiene una política de aprobación activa. Contacta al administrador.',
      approval_policy_unsupported: () =>
        'La política de aprobación tiene pasos que esta versión no puede ejecutar. Contacta al soporte de LinkUs.',
      approval_route_empty: () =>
        'Ningún paso de la política de aprobación aplica a esta solicitud. Contacta al administrador.',
      approval_already_started: () => 'Esta solicitud ya está en aprobación. Recarga la página.',
      approval_not_started: () =>
        'Esta solicitud no tiene una ruta de aprobación iniciada. Pide al administrador que la anule y créala de nuevo.',
      step_already_decided: () =>
        'Este paso ya no está pendiente. Recarga la página para ver el estado actual.',
      not_an_approver: () => 'No eres aprobador de este paso.',
      own_request: () => 'No puedes decidir tu propia solicitud.',
      decision_comment_required: () => 'Escribe un comentario para rechazar o pedir cambios.',
      decision_comment_too_long: (p: Params) =>
        `El comentario puede tener hasta ${p.max ?? '?'} caracteres.`,
      account_disabled: () => 'Tu cuenta está desactivada. Contacta al administrador de LinkUs.',
      // Importación del catálogo (E2-H3): el archivo en sí.
      file_unsupported: () => 'El archivo debe ser un Excel moderno (.xlsx) o un CSV (.csv).',
      file_unreadable: () =>
        'No pudimos leer el archivo. Revisa que no esté dañado y que no tenga contraseña.',
      too_many_columns: () =>
        'La hoja tiene demasiadas columnas. Usa la plantilla y quita las columnas que no necesitas.',
      file_too_large: () => 'El archivo es demasiado grande. El máximo es 2 MB y 5,000 filas.',
      missing_columns: (p: Params) =>
        `Al archivo le faltan columnas obligatorias: ${p.columns ?? ''}. Descarga la plantilla para ver los encabezados.`,
      no_rows: () => 'El archivo no tiene filas de datos debajo del encabezado.',
      too_many_rows: (p: Params) =>
        `El archivo tiene demasiadas filas. El máximo es ${p.max ?? '?'} por importación.`,
      no_valid_rows: () =>
        'No hay filas válidas para importar. Corrige el archivo y vuelve a subirlo.',
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
