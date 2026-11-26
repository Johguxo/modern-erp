// Política "SOF estándar" (flujo-sof-aprobaciones.md §2): Almacén y luego Gerencia local. Es la
// semilla del alta de cada cliente y de las pruebas; en la base vive en approval_policies.
import type { PolicyStepSpec } from './policy';

export const STANDARD_SOF_POLICY: {
  readonly docType: 'SOF';
  readonly name: string;
  readonly steps: readonly PolicyStepSpec[];
} = {
  docType: 'SOF',
  name: 'SOF estándar',
  steps: [
    {
      name: 'Almacén',
      approverType: 'role',
      role: 'warehouse',
      userIds: [],
      rule: 'any',
      condition: {},
    },
    {
      name: 'Gerencia local',
      approverType: 'role',
      role: 'approver',
      userIds: [],
      rule: 'any',
      condition: {},
    },
  ],
};
