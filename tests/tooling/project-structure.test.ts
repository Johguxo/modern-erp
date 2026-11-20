// E0-H1 · Proyecto base: TypeScript estricto con pnpm, scripts y estructura de ADR-001.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MODULES } from '../../tooling/eslint-import-boundaries.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const fromRoot = (...parts: string[]) => path.join(ROOT, ...parts);

interface PackageJson {
  packageManager?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(fromRoot('package.json'), 'utf8')) as PackageJson;

const MODULE_LAYERS = ['domain', 'application', 'infrastructure', 'contracts'];

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

describe('Next.js (App Router) + TypeScript estricto con pnpm', () => {
  it('tsconfig activa strict y noUncheckedIndexedAccess', () => {
    const result = ts.readConfigFile(fromRoot('tsconfig.json'), (file) => ts.sys.readFile(file));
    const config = result.config as { compilerOptions?: Record<string, unknown> } | undefined;

    expect(result.error).toBeUndefined();
    expect(config?.compilerOptions?.strict).toBe(true);
    expect(config?.compilerOptions?.noUncheckedIndexedAccess).toBe(true);
  });

  it('usa pnpm como gestor de paquetes y fija la versión de Node', () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d/);
    expect(pkg.engines?.node).toEqual(expect.any(String));
    expect(isFile(fromRoot('pnpm-lock.yaml'))).toBe(true);
  });

  it('usa Next.js con App Router (src/app con layout y page)', () => {
    expect(pkg.dependencies?.next).toEqual(expect.any(String));
    expect(isFile(fromRoot('src/app/layout.tsx'))).toBe(true);
    expect(isFile(fromRoot('src/app/page.tsx'))).toBe(true);
    expect(isDir(fromRoot('src/pages'))).toBe(false);
  });
});

describe('Scripts: dev, build, start, worker, lint, typecheck, test, test:int, test:e2e, db:generate, db:migrate, db:seed, format', () => {
  it.each([
    'dev',
    'build',
    'start',
    'worker',
    'lint',
    'typecheck',
    'test',
    'test:int',
    'test:e2e',
    'db:generate',
    'db:migrate',
    'db:seed',
    'format',
  ])('existe el script %s', (script) => {
    expect(pkg.scripts?.[script]?.trim()).toBeTruthy();
  });
});

describe('Estructura de carpetas exacta de ADR-001 con un index.ts por módulo', () => {
  it('la lista de módulos es la de ADR-001', () => {
    expect([...MODULES].sort()).toEqual([
      'approvals',
      'catalog',
      'documents',
      'identity',
      'inventory',
      'notifications',
      'requests',
    ]);
  });

  it.each(MODULES)(
    'el módulo %s tiene domain, application, infrastructure, contracts e index.ts',
    (mod) => {
      for (const layer of MODULE_LAYERS) {
        expect(isDir(fromRoot('src/modules', mod, layer)), `${mod}/${layer}`).toBe(true);
      }
      expect(isFile(fromRoot('src/modules', mod, 'index.ts')), `${mod}/index.ts`).toBe(true);
    },
  );

  it.each(MODULES)('el módulo %s no tiene carpetas fuera de las cuatro capas', (mod) => {
    const dirs = readdirSync(fromRoot('src/modules', mod), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...MODULE_LAYERS].sort());
  });

  it('src/modules no tiene carpetas de módulos extra', () => {
    const dirs = readdirSync(fromRoot('src/modules'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...MODULES].sort());
  });

  it.each(['src/app', 'src/shared', 'src/db', 'src/ui'])('existe la carpeta %s', (dir) => {
    expect(isDir(fromRoot(dir))).toBe(true);
  });

  it.each(['src/worker.ts', 'src/env.ts'])('existe el archivo %s', (file) => {
    expect(isFile(fromRoot(file))).toBe(true);
  });
});
