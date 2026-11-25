'use client';

// "Ítems de la solicitud": tabla en escritorio (md+) y tarjetas en el celular, con el mismo marcado
// (un solo conjunto de controles, sin duplicados en el DOM). El total vive en un <output>
// anunciado a lectores de pantalla.
import { Trash2Icon } from 'lucide-react';
import { useId, type Dispatch } from 'react';

import { MoneyText } from '@/ui/base/money-text';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { NativeSelect } from '@/ui/components/native-select';
import { formatMoney, type CurrencyCode } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

import {
  lineError,
  type EditorAction,
  type EditorErrors,
  type EditorLine,
  type Totals,
} from './editor-state';
import { withCurrent } from './header-fields';
import type { SelectOption } from './load-editor-data';

const t = messages.requests.items;

/** Etiqueta visible solo en el celular, donde no hay encabezados de columna. */
function MobileLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="text-xs font-semibold text-muted-foreground md:hidden">
      {children}
    </span>
  );
}

export function LineItems({
  lines,
  errors,
  totals,
  currency,
  equipment,
  dispatch,
}: {
  lines: readonly EditorLine[];
  errors: EditorErrors;
  totals: Totals;
  currency: CurrencyCode;
  equipment: readonly SelectOption[];
  dispatch: Dispatch<EditorAction>;
}) {
  const ids = useId();
  const headingId = `${ids}-heading`;
  const totalLabelId = `${ids}-total`;
  const th = 'px-2 py-2.5 font-semibold first:pl-5 last:pr-5';

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <h2 id={headingId} className="border-b border-border px-5 py-4 text-base font-semibold">
        {t.title}
      </h2>
      {errors.fields.lines ? (
        <p role="alert" className="border-b border-border px-5 py-3 text-destructive">
          {errors.fields.lines}
        </p>
      ) : null}

      {lines.length === 0 ? (
        <p className="px-5 py-6 text-muted-foreground">{t.empty}</p>
      ) : (
        <div className="md:overflow-x-auto">
          <table className="w-full text-sm max-md:block md:min-w-[640px]">
            <thead className="max-md:sr-only">
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className={th}>
                  {t.columns.code}
                </th>
                <th scope="col" className={th}>
                  {t.columns.description}
                </th>
                <th scope="col" className={th}>
                  {t.columns.equipment}
                </th>
                <th scope="col" className={th}>
                  {t.columns.quantity}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.subtotal}
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">{t.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {lines.map((line, index) => {
                const subtotal = totals.subtotals[line.key];
                const quantityError = lineError(errors, index, 'quantity');
                const equipmentError = lineError(errors, index, 'equipmentId');
                const productError = lineError(errors, index, 'productId');
                const qtyErrorId = `${ids}-${line.key}-qty-error`;
                const eqErrorId = `${ids}-${line.key}-eq-error`;
                return (
                  <tr
                    key={line.key}
                    className="border-t border-row-divider align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:px-5 max-md:py-4"
                  >
                    <td className="py-3 pr-2 pl-5 font-semibold max-md:col-span-2 max-md:p-0">
                      {line.code}
                    </td>
                    <td className="px-2 py-3 max-md:col-span-2 max-md:p-0">
                      <div>{line.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.unitPrice(
                          formatMoney(line.unitPrice, currency, { maxFractionDigits: 4 }),
                        )}
                      </div>
                      {productError ? (
                        <p role="alert" className="mt-1 text-[13px] text-destructive">
                          {productError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 max-md:col-span-2 max-md:flex max-md:flex-col max-md:gap-1 max-md:p-0 md:w-48">
                      <MobileLabel>{t.columns.equipment}</MobileLabel>
                      <NativeSelect
                        value={line.equipmentId}
                        aria-label={t.equipmentOf(line.code)}
                        aria-invalid={equipmentError ? true : undefined}
                        aria-describedby={equipmentError ? eqErrorId : undefined}
                        onChange={(event) =>
                          dispatch({
                            type: 'setLineEquipment',
                            key: line.key,
                            value: event.target.value,
                          })
                        }
                      >
                        <option value="">{messages.requests.general.noEquipment}</option>
                        {withCurrent(equipment, line.equipmentId).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </NativeSelect>
                      {equipmentError ? (
                        <p id={eqErrorId} className="text-[13px] text-destructive">
                          {equipmentError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 max-md:flex max-md:flex-col max-md:gap-1 max-md:p-0 md:w-28">
                      <MobileLabel>{t.columns.quantity}</MobileLabel>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={line.quantity}
                        aria-label={t.quantityOf(line.code)}
                        aria-invalid={quantityError ? true : undefined}
                        aria-describedby={quantityError ? qtyErrorId : undefined}
                        onChange={(event) =>
                          dispatch({
                            type: 'setQuantity',
                            key: line.key,
                            value: event.target.value,
                          })
                        }
                      />
                      {quantityError ? (
                        <p id={qtyErrorId} className="text-[13px] text-destructive">
                          {quantityError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-right max-md:flex max-md:flex-col max-md:items-end max-md:gap-1 max-md:p-0">
                      <MobileLabel>{t.columns.subtotal}</MobileLabel>
                      <span className="font-medium">
                        {subtotal === null || subtotal === undefined ? (
                          t.totalUnavailable
                        ) : (
                          <MoneyText amount={subtotal} currency={currency} />
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-5 pl-2 max-md:col-span-2 max-md:p-0">
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive max-md:w-full max-md:border max-md:border-border-strong md:size-11 md:p-0"
                        aria-label={t.removeItem(line.code)}
                        onClick={() => dispatch({ type: 'removeLine', key: line.key })}
                      >
                        <Trash2Icon aria-hidden="true" />
                        <span className="md:sr-only">{t.remove}</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-bg px-5 py-3.5 text-[15px]">
        <span id={totalLabelId} className="text-muted-foreground">
          {t.total}
        </span>
        <output aria-live="polite" aria-labelledby={totalLabelId} className="font-bold">
          {totals.total === null ? (
            t.totalUnavailable
          ) : (
            <MoneyText amount={totals.total} currency={currency} />
          )}
        </output>
      </div>
    </section>
  );
}
