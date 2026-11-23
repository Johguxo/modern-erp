// E0-H4 · Layout (app): el menú filtra por permisos (CLAUDE.md regla 4: permisos, no roles).
import type { Route } from 'next';
import { describe, expect, it } from 'vitest';

import type { Permission } from '@/shared/permissions';

import { APP_NAV, visibleNavItems, type NavItem } from './nav-items';

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
