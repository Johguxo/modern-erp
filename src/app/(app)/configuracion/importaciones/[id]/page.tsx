import Link from 'next/link';
import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createImportQueryDeps, getImportJob, type ImportJobView } from '@/modules/catalog';
import { getImportJobContract } from '@/modules/catalog/contracts';
import { systemClock } from '@/shared/adapters/system-clock';
import { hasPermission } from '@/shared/authorization';
import { isDomainError } from '@/shared/errors';
import { DateText } from '@/ui/base/date-text';
import { PageHeader } from '@/ui/base/page-header';
import { StatusBadge, type BadgeStatus } from '@/ui/base/status-badge';
import { buttonVariants } from '@/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/components/table';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { requireCtx } from '../../../../_lib/session';
import { errorSentence } from '../../_catalog/import-row-errors';

import { AutoRefresh } from './auto-refresh';

const t = messages.catalog.importer.job;

const BACK_HREF = {
  products: '/configuracion/productos',
  equipment: '/configuracion/equipos',
} as const;

const STATUS_BADGE: Record<ImportJobView['status'], BadgeStatus> = {
  pending: 'import_pending',
  processing: 'import_processing',
  completed: 'import_completed',
  failed: 'import_failed',
};

// Resultado de una importación del catálogo (E2-H3). Sin catalog.manage → 404 (no revela que
// existe). Mientras el trabajo esté pendiente, la página se refresca sola cada 2 segundos.
export default async function ImportJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'catalog.manage')) notFound();

  const parsed = getImportJobContract.inputSchema.safeParse({ id: (await params).id });
  if (!parsed.success) notFound();

  let job: ImportJobView;
  try {
    job = await withTenant(ctx, (tx) =>
      getImportJob(ctx, parsed.data, createImportQueryDeps(tx, { clock: systemClock })),
    );
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const waiting = job.status === 'pending' || job.status === 'processing';
  return (
    <>
      <PageHeader
        title={t.title[job.kind]}
        description={undefined}
        actions={
          <Link href={BACK_HREF[job.kind]} className={buttonVariants({ variant: 'outline' })}>
            {t.back}
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={job.stalled ? 'import_failed' : STATUS_BADGE[job.status]} />
        <span className="text-sm text-muted-foreground">
          {t.startedAt} <DateText value={job.createdAt} timeZone={ctx.timezone} />
        </span>
      </div>

      {waiting && !job.stalled ? (
        <>
          <AutoRefresh />
          <p role="status">{t.pendingText}</p>
        </>
      ) : null}
      {job.stalled ? (
        <div
          role="alert"
          className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-warning-text"
        >
          <p className="font-semibold">{t.stalledTitle}</p>
          <p>{t.stalledText}</p>
        </div>
      ) : null}
      {job.status === 'failed' ? (
        <FormError
          message={`${t.failedTitle}. ${
            t.failureReasons[
              (job.failureReason ?? 'unexpected') as keyof typeof t.failureReasons
            ] ?? t.failureReasons.unexpected
          }`}
        />
      ) : null}
      {job.status === 'completed' && job.summary ? (
        <Result job={job} summary={job.summary} />
      ) : null}
    </>
  );
}

function Result({
  job,
  summary,
}: {
  job: ImportJobView;
  summary: NonNullable<ImportJobView['summary']>;
}) {
  const cards = [
    { key: 'created', value: summary.created },
    { key: 'updated', value: summary.updated },
    { key: 'unchanged', value: summary.unchanged },
    { key: 'failed', value: summary.failed },
  ] as const;
  const shownRows = new Set(job.errors.map((error) => error.row)).size;
  const omitted = Math.max(0, summary.failed - shownRows);
  return (
    <section className="flex flex-col gap-6" aria-label={t.title[job.kind]}>
      <p>{t.total(summary.total)}</p>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ key, value }) => (
          <div key={key} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm font-medium text-muted-foreground">{t.cards[key]}</dt>
            <dd className="mt-1 text-3xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {job.errors.length === 0 ? (
        <p>{t.noErrors}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t.errorsTitle}</h2>
          <Table aria-label={t.errorsTableLabel}>
            <TableHeader>
              <TableRow>
                <TableHead>{t.columns.row}</TableHead>
                <TableHead>{t.columns.code}</TableHead>
                <TableHead>{t.columns.reason}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.errors.map((error, index) => (
                <TableRow key={`${error.row}-${error.field ?? ''}-${index}`}>
                  <TableCell>{error.row}</TableCell>
                  <TableCell>{error.code ?? messages.catalog.noValue}</TableCell>
                  <TableCell>{errorSentence(error)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {omitted > 0 ? (
            <p className="text-sm text-muted-foreground">{t.errorsOmitted(omitted)}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
