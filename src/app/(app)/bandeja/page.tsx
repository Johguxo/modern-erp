import type { Route } from 'next';
import Link from 'next/link';

import { hasPermission } from '@/shared/authorization';
import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { requireCtx } from '../../_lib/session';

// Página de relleno para ver el layout; la bandeja real llega en E3-H3.
export default async function InboxPage() {
  const { ctx } = await requireCtx();
  return (
    <>
      <PageHeader
        title={messages.inbox.title}
        actions={
          hasPermission(ctx, 'requests.create') ? (
            <Button asChild>
              <Link href={'/solicitudes/nueva' as Route}>{messages.inbox.newRequest}</Link>
            </Button>
          ) : undefined
        }
      />
      <EmptyState title={messages.inbox.emptyTitle} description={messages.inbox.emptyDescription} />
    </>
  );
}
