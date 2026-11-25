'use server';

// Acciones de la importación del catálogo (E2-H3): el archivo llega en FormData (campos `kind` y
// `file`). Exigen catalog.manage y son de escritura (no pasan en solo lectura). El tamaño se revisa
// antes de leer el archivo a memoria; el tipo y el contenido, en el adaptador.
import {
  createImportCreateDeps,
  createImportReadDeps,
  createImportJob,
  previewImport,
} from '@/modules/catalog';
import {
  confirmImportContract,
  previewImportContract,
  type ImportKind,
} from '@/modules/catalog/contracts';

import { action } from '../../../_lib/action';
import { importExtras } from '../../../_lib/catalog';
import { getSpreadsheetReader, readUpload } from '../../../_lib/spreadsheet';

const preview = action(
  previewImportContract,
  'catalog.manage',
  async ({ ctx, input, tx }) =>
    previewImport(
      ctx,
      { kind: input.kind, ...(await readUpload(input.file)) },
      createImportReadDeps(tx, { reader: getSpreadsheetReader() }),
    ),
  { name: 'catalog.previewImport' },
);

const confirm = action(
  confirmImportContract,
  'catalog.manage',
  async ({ ctx, input, tx, shared }) =>
    createImportJob(
      ctx,
      { kind: input.kind, ...(await readUpload(input.file)) },
      createImportCreateDeps(tx, importExtras(shared)),
    ),
  { name: 'catalog.confirmImport' },
);

/** Los campos de FormData se validan con el contrato (tipo y archivo); aquí solo se leen. */
function fromForm(formData: FormData) {
  return { kind: formData.get('kind') as ImportKind, file: formData.get('file') as File };
}

export async function previewImportAction(formData: FormData) {
  return preview(fromForm(formData));
}

export async function confirmImportAction(formData: FormData) {
  return confirm(fromForm(formData));
}
