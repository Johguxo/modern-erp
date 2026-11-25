import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { withTenant } from '@/db';
import { createGetRequestDeps, getRequest } from '@/modules/requests';
import { isDomainError } from '@/shared/errors';
import { MoneyText } from '@/ui/base/money-text';
import { PageHeader } from '@/ui/base/page-header';
import { StatusBadge } from '@/ui/base/status-badge';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { requireCtx } from '../../../_lib/session';

const t = messages.requests.detail;

// Detalle provisional (E3-H2): destino del envío. E3-H4 lo reemplaza por el detalle completo con la
// línea de tiempo. Quien no puede ver la solicitud (otro tenant, borrador ajeno) recibe 404.
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { ctx } = await requireCtx();
  const request = await withTenant(ctx, (tx) =>
    getRequest(ctx, { id }, createGetRequestDeps(tx)),
  ).catch((error: unknown) => {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const lines = request.lines.filter((line) => line.status === 'active');

  return (
    <>
      <PageHeader
        title={request.number ? t.title(request.number) : t.titleDraft}
        description={t.description}
        actions={
          <>
            <StatusBadge status={request.status} className="self-center" />
            {request.status === 'draft' ? (
              <Button asChild variant="outline">
                <Link href={`/solicitudes/${request.id}/editar` as Route}>{t.editDraft}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex max-w-3xl flex-col gap-5 rounded-xl border border-border bg-surface p-5">
        {request.reason ? (
          <p>
            <span className="font-semibold">{t.reason}: </span>
            {request.reason}
          </p>
        ) : null}
        <section aria-label={t.items}>
          <h2 className="mb-2 text-base font-semibold">{t.items}</h2>
          {lines.length === 0 ? (
            <p className="text-muted-foreground">{t.empty}</p>
          ) : (
            <ul>
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap justify-between gap-2 border-t border-row-divider py-2"
                >
                  <span>{t.itemLine(line.productCode, line.description, line.quantity)}</span>
                  <MoneyText amount={line.subtotal} currency={request.currency} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="flex justify-between border-t border-border pt-3 text-[15px]">
          <span className="text-muted-foreground">{t.total}</span>
          <strong>
            <MoneyText amount={request.totalAmount} currency={request.currency} />
          </strong>
        </p>
      </div>
      <p className="mt-4">
        <Link href="/bandeja" className="text-primary hover:text-primary-hover">
          {t.backToInbox}
        </Link>
      </p>
    </>
  );
}
