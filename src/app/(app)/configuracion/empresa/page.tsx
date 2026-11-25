import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createSettingsDeps, getCompanySettings } from '@/modules/identity';
import { createSequenceDeps, getDocumentSequence } from '@/modules/requests';
import { hasPermission } from '@/shared/authorization';
import { NotFoundError } from '@/shared/errors';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

import { readOnlySettingsExtras } from '../../../_lib/company';
import { readOnlyRequestsExtras } from '../../../_lib/requests';
import { requireCtx } from '../../../_lib/session';

import { CompanyForm } from './company-form';
import { LogoField } from './logo-field';
import { SequenceCard } from './sequence-card';

// Configuración de la empresa (E1-H5). Sin settings.manage → 404 (no revela que existe).
export default async function CompanyPage() {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'settings.manage')) notFound();

  const { settings, sequence } = await withTenant(ctx, async (tx) => ({
    settings: await getCompanySettings(ctx, createSettingsDeps(tx, readOnlySettingsExtras())),
    // Un cliente sin secuencia (no debería pasar) no tumba la página: se oculta la tarjeta.
    sequence: await getDocumentSequence(
      ctx,
      createSequenceDeps(tx, { client: readOnlyRequestsExtras().client }),
    ).catch((error: unknown) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    }),
  }));
  return (
    <>
      <PageHeader title={messages.company.title} description={messages.company.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CompanyForm settings={settings} readOnly={ctx.readOnly} />
        <LogoField settings={settings} readOnly={ctx.readOnly} />
        {sequence ? <SequenceCard sequence={sequence} readOnly={ctx.readOnly} /> : null}
      </div>
    </>
  );
}
