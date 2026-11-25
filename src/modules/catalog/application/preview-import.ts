// Vista previa de una importación (E2-H3, catalog.manage): valida todas las filas ya extraídas del
// archivo (ver read-import-rows) y devuelve totales, las primeras filas y los errores. No guarda
// nada.
import type { Ctx } from '@/shared/context';

import type { RowError } from '../contracts/import';
import { IMPORT_LIMITS, type ImportKind, type ImportRow } from '../domain/import';

import type { ImportReadDeps } from './import-ports';
import { validateImportRows } from './import-rows';
import { requireCatalogWrite } from './master-data';
import type { ImportRowsInput } from './read-import-rows';

export interface ImportPreview {
  readonly kind: ImportKind;
  readonly total: number;
  readonly valid: number;
  readonly failed: number;
  readonly rows: ImportRow[];
  readonly errors: RowError[];
}

/** Valida las filas con la moneda de la empresa; también lo usa la creación del trabajo. */
export async function validateImportInput(
  ctx: Ctx,
  input: ImportRowsInput,
  deps: ImportReadDeps,
): Promise<{
  defaultCurrency: Awaited<ReturnType<ImportReadDeps['tenantCurrency']>>;
  validation: ReturnType<typeof validateImportRows>;
}> {
  const defaultCurrency = await deps.tenantCurrency(ctx.tenantId);
  const validation = validateImportRows(input.kind, input.rows, { defaultCurrency });
  return { defaultCurrency, validation };
}

export async function previewImport(
  ctx: Ctx,
  input: ImportRowsInput,
  deps: ImportReadDeps,
): Promise<ImportPreview> {
  requireCatalogWrite(ctx);
  const { validation } = await validateImportInput(ctx, input, deps);
  return {
    kind: input.kind,
    total: input.rows.length,
    valid: validation.valid.length,
    failed: validation.failedRows,
    rows: input.rows.slice(0, IMPORT_LIMITS.previewRows),
    errors: validation.errors.slice(0, IMPORT_LIMITS.maxStoredErrors),
  };
}
