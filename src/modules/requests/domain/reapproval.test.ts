// E4-H4 · Las tres ramas de la regla de reaprobación (flujo §4).
import { describe, expect, it } from 'vitest';

import { reapprovalBranch } from './reapproval';

const branch = (previousTotal: string, newTotal: string, tolerancePct = '0') =>
  reapprovalBranch({ previousTotal, newTotal, tolerancePct });

describe('reapprovalBranch', () => {
  it('amount_unchanged: el total no cambia (equipo, notas o producto equivalente)', () => {
    expect(branch('100.00', '100.00')).toBe('amount_unchanged');
    expect(branch('100.00', '100.00', '10')).toBe('amount_unchanged');
  });

  it('within_tolerance: baja el total, aunque la tolerancia sea 0', () => {
    expect(branch('100.00', '90.00')).toBe('within_tolerance');
    expect(branch('100.00', '0.00')).toBe('within_tolerance');
  });

  it('within_tolerance: sube, pero no más que la tolerancia (límite inclusivo)', () => {
    expect(branch('100.00', '105.00', '5')).toBe('within_tolerance');
    expect(branch('200.00', '210.00', '5')).toBe('within_tolerance');
    expect(branch('0.10', '0.11', '10')).toBe('within_tolerance');
  });

  it('above_tolerance: sube por encima de la tolerancia (con 0 %, cualquier subida)', () => {
    expect(branch('100.00', '100.01')).toBe('above_tolerance');
    expect(branch('100.00', '105.01', '5')).toBe('above_tolerance');
    expect(branch('100.00', '150.00', '49.99')).toBe('above_tolerance');
  });

  it('la tolerancia se calcula con decimales exactos, sin errores de coma flotante', () => {
    expect(branch('0.30', '0.33', '10')).toBe('within_tolerance');
    expect(branch('0.30', '0.34', '10')).toBe('above_tolerance');
  });

  it('con total anterior 0 cualquier subida pide reconfirmación', () => {
    expect(branch('0.00', '0.01', '100')).toBe('above_tolerance');
    expect(branch('0.00', '0.00', '100')).toBe('amount_unchanged');
  });
});
