// E0-H4 · Layout (app): el menú filtra por permisos (CLAUDE.md regla 4: permisos, no roles).
import type { Route } from 'next';
import { describe, expect, it } from 'vitest';

import type { Permission } from '@/shared/permissions';

import { APP_NAV, isNavItemActive, visibleNavItems, type NavItem } from './nav-items';

const READ_OWN = 'requests.read_own' satisfies Permission;

const guarded: NavItem = { href: '/bandeja', label: 'Bandeja', permission: READ_OWN };
const open: NavItem = { href: '/abierta' as Route, label: 'Abierta' };
const ITEMS = [guarded, open];

describe('visibleNavItems', () => {
  it('sin permisos (todavía no hay ctx) muestra todos los ítems', () => {
    expect(visibleNavItems(ITEMS)).toEqual(ITEMS);
  });

  it('devuelve una copia: no expone el arreglo original', () => {
    const result = visibleNavItems(ITEMS);
    expect(result).not.toBe(ITEMS);
  });

  it('con el permiso del ítem, lo incluye', () => {
    expect(visibleNavItems(ITEMS, new Set<Permission>([READ_OWN]))).toContain(guarded);
  });

  it('sin el permiso del ítem, lo excluye', () => {
    expect(visibleNavItems(ITEMS, new Set<Permission>())).not.toContain(guarded);
  });

  it('un ítem sin permiso exigido siempre es visible', () => {
    expect(visibleNavItems(ITEMS, new Set<Permission>())).toEqual([open]);
    expect(visibleNavItems(ITEMS, new Set<Permission>([READ_OWN]))).toContain(open);
  });

  it('APP_NAV tiene la Bandeja en /bandeja', () => {
    expect(APP_NAV.map((item) => item.href)).toContain('/bandeja');
  });
});

describe('Nueva solicitud', () => {
  const newRequest = APP_NAV.find((item) => (item.href as string) === '/solicitudes/nueva');

  it('va después de la Bandeja y exige requests.create', () => {
    expect(APP_NAV[1]).toBe(newRequest);
    expect(newRequest?.permission).toBe('requests.create');
  });

  it('lo ve quien puede crear solicitudes y no quien solo aprueba o lee', () => {
    const create = new Set<Permission>(['requests.create']);
    const approve = new Set<Permission>(['requests.read_own', 'approvals.decide']);
    expect(newRequest && visibleNavItems(APP_NAV, create)).toContain(newRequest);
    expect(visibleNavItems(APP_NAV, approve)).not.toContain(newRequest);
  });

  it('se marca activo en su ruta', () => {
    expect(newRequest && isNavItemActive(newRequest, '/solicitudes/nueva')).toBe(true);
    expect(newRequest && isNavItemActive(newRequest, '/bandeja')).toBe(false);
  });
});

describe('isNavItemActive', () => {
  const catalog = APP_NAV.find((item) => item.permission === 'catalog.manage');

  it('APP_NAV tiene Catálogo, protegido con catalog.manage, después de la Bandeja', () => {
    expect(catalog?.href).toBe('/configuracion/productos');
    expect(APP_NAV[0]?.href).toBe('/bandeja');
    expect(APP_NAV[2]).toBe(catalog);
  });

  it('marca activo en la ruta del ítem y sus subrutas', () => {
    expect(catalog && isNavItemActive(catalog, '/configuracion/productos')).toBe(true);
    expect(catalog && isNavItemActive(catalog, '/configuracion/productos/x')).toBe(true);
  });

  it('marca activo en los prefijos extra (equipos y centros de costo)', () => {
    expect(catalog && isNavItemActive(catalog, '/configuracion/equipos')).toBe(true);
    expect(catalog && isNavItemActive(catalog, '/configuracion/centros-de-costo')).toBe(true);
  });

  it('no marca activo otras rutas ni prefijos parecidos', () => {
    expect(catalog && isNavItemActive(catalog, '/configuracion/usuarios')).toBe(false);
    expect(catalog && isNavItemActive(catalog, '/configuracion/productosx')).toBe(false);
    expect(isNavItemActive(guarded, '/bandeja')).toBe(true);
    expect(isNavItemActive(guarded, '/bandeja/1')).toBe(true);
  });
});
