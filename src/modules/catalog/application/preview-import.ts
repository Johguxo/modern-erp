// Vista previa de una importación (E2-H3, catalog.manage): lee el archivo, valida todas las filas
// y devuelve totales, las primeras filas y los errores. No guarda nada.
import type { Ctx } from '@/shared/context';

import type { RowError } from '../contracts/import';
import { IMPORT_LIMITS, extractRows, type ImportKind, type ImportRow } from '../domain/import';

import type { ImportReadDeps } from './import-ports';
import { validateImportRows } from './import-rows';
import { requireCatalogWrite } from './master-data';

export interface ImportFileInput {
  readonly kind: ImportKind;
  /** Nombre original: su extensión decide si es .xlsx o .csv. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface ImportPreview {
  readonly kind: ImportKind;
  readonly total: number;
  readonly valid: number;
  readonly failed: number;
  readonly rows: ImportRow[];
  readonly errors: RowError[];
}

/** Lee y valida el archivo; también lo usa la creación del trabajo. */
export async function readImportFile(
  ctx: Ctx,
  input: ImportFileInput,
  deps: ImportReadDeps,
): Promise<{
  rows: ImportRow[];
  defaultCurrency: Awaited<ReturnType<ImportReadDeps['tenantCurrency']>>;
  validation: ReturnType<typeof validateImportRows>;
}> {
  const sheet = await deps.reader.readFirstSheet({ name: input.name, bytes: input.bytes });
  const rows = extractRows(sheet, input.kind);
  const defaultCurrency = await deps.tenantCurrency(ctx.tenantId);
  const validation = validateImportRows(input.kind, rows, { defaultCurrency });
  return { rows, defaultCurrency, validation };
}

export async function previewImport(
  ctx: Ctx,
  input: ImportFileInput,
  deps: ImportReadDeps,
): Promise<ImportPreview> {
  requireCatalogWrite(ctx);
  const { rows, validation } = await readImportFile(ctx, input, deps);
  return {
    kind: input.kind,
    total: rows.length,
    valid: validation.valid.length,
    failed: validation.failedRows,
    rows: rows.slice(0, IMPORT_LIMITS.previewRows),
    errors: validation.errors.slice(0, IMPORT_LIMITS.maxStoredErrors),
  };
}
