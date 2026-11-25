// Lectura de referencias del catálogo para otros módulos (el SOF valida y copia lo que pide):
// solo devuelve lo activo del tenant; lo que no aparece no existe, está inactivo o es de otro tenant.
import { z } from 'zod';

import { costCenterViewSchema, equipmentViewSchema, productViewSchema } from './views';

const ids = z.array(z.uuid()).max(500).default([]);

export const inputSchema = z.object({
  productIds: ids,
  equipmentIds: ids,
  costCenterIds: ids,
});

export const outputSchema = z.object({
  products: z.array(productViewSchema),
  equipment: z.array(equipmentViewSchema),
  costCenters: z.array(costCenterViewSchema),
});
