import Link from 'next/link';
import { redirect } from 'next/navigation';

import { withTenant } from '@/db';
import { createListRequestsDeps, listRequests } from '@/modules/requests';
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { readOnlyRequestsExtras } from '../../_lib/requests';
import { requireCtx } from '../../_lib/session';

import { InboxSearch } from './_inbox/inbox-search';
import { InboxSummary } from './_inbox/inbox-summary';
import { InboxTabs } from './_inbox/inbox-tabs';
import { inboxHref, isPristine, pageCountOf, parseInboxParams } from './_inbox/inbox-params';
import { RequestsTable } from './_inbox/requests-table';

const t = messages.inbox;

const canReadRequests = (ctx: Ctx): boolean =>
  hasPermission(ctx, 'requests.create') ||
  hasPermission(ctx, 'requests.read_own') ||
  hasPermission(ctx, 'requests.read_all');

/** «Hola, Ruby»: solo el primer nombre. */
const firstName = (fullName: string | null): string | null => fullName?.split(/\s+/)[0] || null;

// Bandeja de solicitudes (E3-H3): saludo, resumen, pestañas, búsqueda y tabla con paginación del
// servidor. Todo el estado vive en la URL (?tab=&q=&page=).
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx } = await requireCtx();
  const canCreate = hasPermission(ctx, 'requests.create');
  const newRequest = canCreate ? (
    ctx.readOnly ? (
      <Button disabled>{t.newRequest}</Button>
    ) : (
      <Button asChild>
        <Link href="/solicitudes/nueva">{t.newRequest}</Link>
      </Button>
    )
  ) : undefined;

  // Sin ningún permiso de solicitudes (p. ej. compras, fase 2): bandeja vacía, sin consultar.
  if (!canReadRequests(ctx)) {
    return (
      <>
        <PageHeader title={t.title} actions={newRequest} />
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
      </>
    );
  }

  const params = parseInboxParams(await searchParams);
  const data = await withTenant(ctx, (tx) =>
    listRequests(ctx, params, createListRequestsDeps(tx, readOnlyRequestsExtras())),
  );

  // Página fuera de rango (p. ej. ?page=9 con 2 páginas): a la última, conservando pestaña y q.
  const pageCount = pageCountOf(data.total, params.pageSize);
  if (data.total > 0 && params.page > pageCount) {
    redirect(inboxHref({ tab: params.tab, q: params.q, page: pageCount }));
  }

  // Sin resultados en una página > 1 (p. ej. ?q= nuevo con ?page= viejo): a la primera.
  if (data.total === 0 && params.page > 1) {
    redirect(inboxHref({ tab: params.tab, q: params.q, page: 1 }));
  }

  const greeting = t.greeting(firstName(data.viewerName));
  if (data.total === 0 && isPristine(params)) {
    return (
      <>
        <PageHeader eyebrow={greeting} title={t.title} actions={newRequest} />
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            canCreate ? (
              ctx.readOnly ? (
                <Button disabled>{t.emptyAction}</Button>
              ) : (
                <Button asChild>
                  <Link href="/solicitudes/nueva">{t.emptyAction}</Link>
                </Button>
              )
            ) : undefined
          }
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={greeting} title={t.title} actions={newRequest} className="mb-0" />
      <InboxSummary summary={data.summary} />
      <section
        aria-label={t.listLabel}
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-4 sm:px-5">
          <InboxTabs active={params.tab} q={params.q} />
          <InboxSearch q={params.q} />
        </div>
        <RequestsTable
          items={data.items}
          timeZone={ctx.timezone}
          page={params.page}
          pageCount={pageCount}
          readOnly={ctx.readOnly}
        />
      </section>
    </div>
  );
}
