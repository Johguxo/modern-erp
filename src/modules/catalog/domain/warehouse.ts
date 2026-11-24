// Almacén por defecto de cada cliente: se crea con el alta del tenant (en el MVP hay uno solo).
export const DEFAULT_WAREHOUSE = {
  code: 'PRINCIPAL',
  name: 'Almacén principal',
} as const;
