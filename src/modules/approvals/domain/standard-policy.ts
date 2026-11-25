// Política "SOF estándar" (flujo-sof-aprobaciones.md §2): Almacén y luego Gerencia local. Hasta que
// E4-H1 guarde las políticas en la base, la vista previa usa esta, igual a la del seed.
import type { ApprovalPolicy } from './route-preview';

export const STANDARD_SOF_POLICY: ApprovalPolicy = {
  name: 'SOF estándar',
  steps: [
    { order: 1, name: 'Almacén', role: 'warehouse', rule: 'any' },
    { order: 2, name: 'Gerencia local', role: 'approver', rule: 'any' },
  ],
};
