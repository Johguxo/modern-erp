import { redirect } from 'next/navigation';

import { createSessionServices, resolveEntry } from '@/modules/identity';
import { messages } from '@/ui/messages/es-PE';

import { getAuthProvider } from '../../_lib/auth';

import { TenantPicker } from './tenant-picker';

export default async function ChooseTenantPage() {
  const session = await (await getAuthProvider()).getSession();
  if (!session) redirect('/login');
  const { decision, access } = await resolveEntry(session.authUserId, createSessionServices());
  if (decision.kind !== 'choose') redirect('/auth/continuar');

  return (
    <>
      <h1 className="text-2xl font-bold">{messages.auth.chooseTenantTitle}</h1>
      <p className="mt-1 mb-4 text-muted-foreground">{messages.auth.chooseTenantDescription}</p>
      <TenantPicker tenants={access.memberships} />
    </>
  );
}
