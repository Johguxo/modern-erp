'use server';

// Acciones de /configuracion/empresa (E1-H5): validan con los contratos de identity y llaman al
// caso de uso; settings.manage se revisa aquí y otra vez en el caso de uso. Solo lectura: bloqueadas.
import {
  createSettingsDeps,
  removeCompanyLogo,
  updateCompanySettings,
  uploadCompanyLogo,
} from '@/modules/identity';
import { createSequenceDeps, updateDocumentSequence } from '@/modules/requests';
import { updateDocumentSequenceContract } from '@/modules/requests/contracts';
import {
  removeCompanyLogoContract,
  updateCompanySettingsContract,
  uploadCompanyLogoContract,
} from '@/modules/identity/contracts';

import { action } from '../../../_lib/action';
import { settingsExtras } from '../../../_lib/company';

export const updateCompanySettingsAction = action(
  updateCompanySettingsContract,
  'settings.manage',
  ({ ctx, input, tx, shared }) =>
    updateCompanySettings(ctx, input, createSettingsDeps(tx, settingsExtras(shared))),
  { name: 'identity.updateCompanySettings' },
);

const uploadLogo = action(
  uploadCompanyLogoContract,
  'settings.manage',
  async ({ ctx, input, tx, shared }) =>
    uploadCompanyLogo(
      ctx,
      { bytes: new Uint8Array(await input.logo.arrayBuffer()) },
      createSettingsDeps(tx, settingsExtras(shared)),
    ),
  { name: 'identity.uploadCompanyLogo' },
);

/** El archivo llega en FormData (campo `logo`). */
export async function uploadCompanyLogoAction(formData: FormData) {
  return uploadLogo({ logo: formData.get('logo') as File });
}

export const removeCompanyLogoAction = action(
  removeCompanyLogoContract,
  'settings.manage',
  ({ ctx, input, tx, shared }) =>
    removeCompanyLogo(ctx, input, createSettingsDeps(tx, settingsExtras(shared))),
  { name: 'identity.removeCompanyLogo' },
);

// Numeración del SOF (E3-H1): mismo permiso que el resto de la empresa; en solo lectura, bloqueada.
export const updateDocumentSequenceAction = action(
  updateDocumentSequenceContract,
  'settings.manage',
  ({ ctx, input, tx, shared }) =>
    updateDocumentSequence(
      ctx,
      { prefix: input.sequencePrefix, nextNumber: input.sequenceNextNumber },
      createSequenceDeps(tx, { client: shared.client }),
    ),
  { name: 'requests.updateDocumentSequence' },
);
