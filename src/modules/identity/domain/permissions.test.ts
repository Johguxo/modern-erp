// E1-H1 · Mapa rol → permisos: debe ser exactamente la tabla "Permisos iniciales" de ADR-002 §2.
import { describe, expect, it } from 'vitest';

import { PERMISSIONS, TENANT_ROLES, type Permission, type Role } from '@/shared/permissions';

import { permissionsFor, ROLE_PERMISSIONS } from './permissions';

// Copia literal de ADR-002 (columnas admin | requester | warehouse | approver).
// `purchasing` no aparece en la tabla: es de fase 2 y no tiene permisos en el MVP.
const ADR_002_MATRIX = `
| \`requests.create\` | ✓ | ✓ | ✓ | |
| \`requests.read_own\` | ✓ | ✓ | ✓ | ✓ |
| \`requests.read_all\` | ✓ | | ✓ | ✓ |
| \`requests.correct_line\` | ✓ | | ✓ | |
| \`requests.deliver\` | ✓ | | ✓ | |
| \`requests.cancel_any\` | ✓ | | | |
| \`approvals.decide\` | ✓ | | ✓ | ✓ |
| \`catalog.manage\` | ✓ | | ✓ | |
| \`inventory.manage\` | ✓ | | ✓ | |
| \`users.manage\` | ✓ | | | |
| \`settings.manage\` | ✓ | | | |
| \`approval_policies.manage\` | ✓ | | | |
`;
const ADR_COLUMNS = ['admin', 'requester', 'warehouse', 'approver'] as const;

function expectedFromAdr(): Record<Role, Set<string>> {
  const expected: Record<Role, Set<string>> = {
    admin: new Set(),
    requester: new Set(),
    warehouse: new Set(),
    approver: new Set(),
    purchasing: new Set(),
  };
  const lines = ADR_002_MATRIX.trim().split('\n');
  for (const line of lines) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const permission = cells[0]?.replaceAll('`', '') ?? '';
    ADR_COLUMNS.forEach((role, i) => {
      if (cells[i + 1] === '✓') expected[role].add(permission);
    });
  }
  return expected;
}

const EXPECTED = expectedFromAdr();

describe('ROLE_PERMISSIONS es la tabla de ADR-002 rol por rol', () => {
  it('la tabla copiada tiene las 12 filas de permisos', () => {
    expect(ADR_002_MATRIX.trim().split('\n')).toHaveLength(12);
  });

  it.each(TENANT_ROLES)('el rol %s tiene exactamente los permisos de la tabla', (role) => {
    expect(new Set(ROLE_PERMISSIONS[role])).toEqual(EXPECTED[role]);
  });

  it('cada rol del mapa no repite permisos', () => {
    for (const role of TENANT_ROLES) {
      expect(new Set(ROLE_PERMISSIONS[role]).size).toBe(ROLE_PERMISSIONS[role].length);
    }
  });

  it('todo permiso de PERMISSIONS está asignado a algún rol', () => {
    const assigned = new Set<string>(TENANT_ROLES.flatMap((role) => [...ROLE_PERMISSIONS[role]]));
    for (const permission of PERMISSIONS) expect(assigned.has(permission)).toBe(true);
  });

  it('todos los permisos de la tabla existen en PERMISSIONS', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of TENANT_ROLES) {
      for (const permission of EXPECTED[role]) expect(known.has(permission)).toBe(true);
    }
  });

  it('purchasing no tiene permisos (fase 2)', () => {
    expect(ROLE_PERMISSIONS.purchasing).toHaveLength(0);
  });

  it('admin tiene todos los permisos', () => {
    expect(new Set(ROLE_PERMISSIONS.admin)).toEqual(new Set(PERMISSIONS));
  });
});

describe('permissionsFor', () => {
  it('sin roles devuelve un conjunto vacío', () => {
    expect(permissionsFor([]).size).toBe(0);
  });

  it('un solo rol devuelve sus permisos', () => {
    expect(permissionsFor(['approver'])).toEqual(new Set(ROLE_PERMISSIONS.approver));
  });

  it('requester + approver es la unión sin duplicados', () => {
    const result = permissionsFor(['requester', 'approver']);

    expect(result).toEqual(
      new Set<Permission>([
        'requests.create',
        'requests.read_own',
        'requests.read_all',
        'approvals.decide',
      ]),
    );
    expect(result.size).toBe(4);
  });

  it('repetir un rol no cambia el resultado', () => {
    expect(permissionsFor(['warehouse', 'warehouse'])).toEqual(permissionsFor(['warehouse']));
  });

  it('purchasing no agrega permisos', () => {
    expect(permissionsFor(['requester', 'purchasing'])).toEqual(permissionsFor(['requester']));
  });

  it('admin con cualquier otro rol sigue siendo todos los permisos', () => {
    expect(permissionsFor(['admin', 'requester'])).toEqual(new Set(PERMISSIONS));
  });
});
