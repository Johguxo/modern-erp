// Tabla de ítems del detalle (solo líneas activas). En pantallas angostas cada fila es una tarjeta.
// El resaltado de la línea corregida llega con E4-H4.
import type { ReactNode } from 'react';

import type { RequestAction, RequestDetail } from '@/modules/requests';
import { MoneyText } from '@/ui/base/money-text';
import { trimDecimal } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

import { ActionButton } from './action-button';

const t = messages.requests.detail;

const th = 'px-2 py-2.5 font-semibold first:pl-5 last:pr-5';

function MobileLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground uppercase md:hidden">{children}</span>;
}

export function DetailItems({
  detail,
  actions,
  readOnly,
  noteId,
}: {
  detail: RequestDetail;
  actions: readonly RequestAction[];
  readOnly: boolean;
  noteId?: string;
}) {
  const { columns } = t.items;
  return (
    <section
      aria-labelledby="detail-items-title"
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="detail-items-title" className="text-base font-semibold">
          {t.items.title}
        </h2>
        {actions.includes('correct_line') ? (
          <ActionButton
            action="correct_line"
            requestId={detail.id}
            readOnly={readOnly}
            noteId={noteId}
          />
        ) : null}
      </div>
      {detail.lines.length === 0 ? (
        <p className="px-5 py-6 text-muted-foreground">{t.items.empty}</p>
      ) : (
        <div className="md:overflow-x-auto">
          <table className="w-full text-sm max-md:block md:min-w-[640px]">
            <thead className="max-md:sr-only">
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className={th}>
                  {columns.number}
                </th>
                <th scope="col" className={th}>
                  {columns.code}
                </th>
                <th scope="col" className={th}>
                  {columns.description}
                </th>
                <th scope="col" className={th}>
                  {columns.equipment}
                </th>
                <th scope="col" className={th}>
                  {columns.quantity}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {columns.subtotal}
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {detail.lines.map((line, index) => (
                <tr
                  key={line.id}
                  className="border-t border-row-divider align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:px-5 max-md:py-4"
                >
                  <td className="py-3 pr-2 pl-5 font-semibold max-md:col-span-2 max-md:p-0">
                    <span className="md:hidden">{columns.number} </span>
                    {index + 1}
                    <span className="font-semibold md:hidden"> · {line.productCode}</span>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap max-md:hidden">{line.productCode}</td>
                  <td className="px-2 py-3 max-md:col-span-2 max-md:p-0">{line.description}</td>
                  <td className="px-2 py-3 text-ink-2 max-md:flex max-md:flex-col max-md:gap-1 max-md:p-0">
                    <MobileLabel>{columns.equipment}</MobileLabel>
                    {line.equipmentLabel ?? t.noValue}
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap max-md:flex max-md:flex-col max-md:gap-1 max-md:p-0">
                    <MobileLabel>{columns.quantity}</MobileLabel>
                    {t.items.quantityWithUnit(trimDecimal(line.quantity, 0), line.unit)}
                  </td>
                  <td className="py-3 pr-5 pl-2 text-right max-md:flex max-md:flex-col max-md:items-end max-md:gap-1 max-md:p-0">
                    <MobileLabel>{columns.subtotal}</MobileLabel>
                    <MoneyText amount={line.subtotal} currency={detail.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-center justify-between border-t border-border px-5 py-3 text-[15px]">
        <span className="text-muted-foreground">{t.items.total}</span>
        <strong>
          <MoneyText amount={detail.totalAmount} currency={detail.currency} />
        </strong>
      </p>
    </section>
  );
}
