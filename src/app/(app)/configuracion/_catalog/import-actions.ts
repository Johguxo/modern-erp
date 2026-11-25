'use server';

// Acciones de la importación del catálogo (E2-H3): el archivo llega en FormData (campos `kind` y
// `file`). Exigen catalog.manage y son de escritura (no pasan en solo lectura).
//
// El archivo se lee ANTES de abrir la transacción (descomprimir y parsear es trabajo de CPU y
// memoria que no debe retener una conexión), pero solo después de comprobar sesión, permiso y que la
// empresa no esté en solo lectura (`prepare`): sin permiso no se lee ni un byte. Las acciones
// internas (no exportadas, no invocables desde el cliente) reciben las filas ya extraídas.
import {
  createImportCreateDeps,
  createImportReadDeps,
  createImportJob,
  previewImport,
  readImportRows,
} from '@/modules/catalog';
import {
  confirmImportContract,
  importKindSchema,
  previewImportContract,
} from '@/modules/catalog/contracts';
import type { Ctx } from '@/shared/context';
import { ValidationError } from '@/shared/errors';

import { action, prepare } from '../../../_lib/action';
import { importExtras } from '../../../_lib/catalog';
import { getSpreadsheetReader, readUpload } from '../../../_lib/spreadsheet';

const preview = action(
  previewImportContract,
  'catalog.manage',
  ({ ctx, input, tx }) => previewImport(ctx, input, createImportReadDeps(tx)),
  { name: 'catalog.previewImport' },
);

const confirm = action(
  confirmImportContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    createImportJob(ctx, input, createImportCreateDeps(tx, importExtras(shared))),
  { name: 'catalog.confirmImport' },
);

/** Tipo y archivo del FormData → filas de datos; revisa el tamaño antes de leer a memoria. */
async function rowsFromForm(ctx: Ctx, formData: FormData) {
  const kind = importKindSchema.safeParse(formData.get('kind'));
  const file = formData.get('file');
  if (!kind.success || !(file instanceof File)) {
    throw new ValidationError({ message: 'Import form needs a kind and a file' });
  }
  const upload = await readUpload(file);
  const rows = await readImportRows(
    ctx,
    { kind: kind.data, ...upload },
    { reader: getSpreadsheetReader() },
  );
  return { kind: kind.data, rows };
}

export async function previewImportAction(formData: FormData) {
  const read = await prepare('catalog.manage', 'catalog.previewImport.read', (ctx) =>
    rowsFromForm(ctx, formData),
  );
  return read.ok ? preview(read.data) : read;
}

export async function confirmImportAction(formData: FormData) {
  const read = await prepare('catalog.manage', 'catalog.confirmImport.read', (ctx) =>
    rowsFromForm(ctx, formData),
  );
  return read.ok ? confirm(read.data) : read;
}
