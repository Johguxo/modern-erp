import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createSettingsDeps, getCompanySettings } from '@/modules/identity';
import { hasPermission } from '@/shared/authorization';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

import { readOnlySettingsExtras } from '../../../_lib/company';
import { requireCtx } from '../../../_lib/session';

import { CompanyForm } from './company-form';
import { LogoField } from './logo-field';

// Configuración de la empresa (E1-H5). Sin settings.manage → 404 (no revela que existe).
export default async function CompanyPage() {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'settings.manage')) notFound();

  const settings = await withTenant(ctx, (tx) =>
    getCompanySettings(ctx, createSettingsDeps(tx, readOnlySettingsExtras())),
  );
  return (
    <>
      <PageHeader title={messages.company.title} description={messages.company.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CompanyForm settings={settings} readOnly={ctx.readOnly} />
        <LogoField settings={settings} readOnly={ctx.readOnly} />
      </div>
    </>
  );
}
