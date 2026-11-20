// Textos visibles de la interfaz (es-PE). Toda cadena que ve el usuario vive aquí.
export const messages = {
  app: {
    name: 'LinkUs',
    title: 'LinkUs · Plataforma de Compras y Almacén',
  },
  home: {
    title: 'LinkUs · Plataforma de Compras y Almacén',
    description: 'Proyecto base en construcción.',
  },
} as const;

export type Messages = typeof messages;
