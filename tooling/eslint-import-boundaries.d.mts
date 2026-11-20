// Tipos de eslint-import-boundaries.mjs para importarlo desde TypeScript (pruebas en tests/tooling).
import type { Linter } from 'eslint';

/** Única fuente de la lista de módulos (ADR-001 §Estructura). */
export declare const MODULES: string[];

/** Bloques de flat config para `no-restricted-imports`. */
export declare const importBoundaries: Linter.Config[];
