'use client';

// Diálogo «Corregir una línea» (E4-H4): corregir, agregar o quitar una línea de un SOF en aprobación
// o aprobado, siempre con motivo. Sigue el patrón de «Anular»: al guardar, la página se recarga con
// ?corregido=1 y, si el documento cambió antes (conflicto o cambio de estado), ofrece «Recargar».
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { RequestDetailLine } from '@/modules/requests';
import { CORRECTION_REASON_MAX } from '@/modules/requests/contracts';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
import { Input } from '@/ui/components/input';
import { NativeSelect } from '@/ui/components/native-select';
import { Textarea } from '@/ui/components/textarea';
import type { CurrencyCode } from '@/ui/format/money';
import { FormError } from '@/ui/forms/form-error';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { CatalogSearch } from '../../_editor/catalog-search';
import { Field } from '../../_editor/field';
import type { SelectOption } from '../../_editor/load-editor-data';
import { correctLineAction } from '../../actions';

import {
  buildInput,
  initialFormState,
  pickProduct,
  selectLine,
  selectMode,
  serverFieldErrors,
  type CorrectLineFormState,
  type CorrectMode,
  type FormErrors,
} from './correct-line-form';

const t = messages.requests.detail.correctLine;
const MODES: readonly CorrectMode[] = ['update', 'add', 'remove'];

export function CorrectLineDialog({
  requestId,
  version,
  number,
  lines,
  equipment,
  currency,
  large = false,
  className,
}: {
  requestId: string;
  /** Versión del documento que vio la página: la corrección falla si cambió. */
  version: number;
  number: string | null;
  lines: readonly RequestDetailLine[];
  /** Equipos activos; el de la línea se agrega aunque ya no esté activo. */
  equipment: readonly SelectOption[];
  currency: CurrencyCode;
  large?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CorrectLineFormState>(() => initialFormState(lines));
  const [errors, setErrors] = useState<FormErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [reload, setReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changingProduct, setChangingProduct] = useState(false);

  const patch = (next: Partial<CorrectLineFormState>) => setState((prev) => ({ ...prev, ...next }));
  const used = state.reason.trim().length;
  const showPicker = changingProduct || (state.mode === 'add' && state.productId === '');
  const line = lines.find((item) => item.id === state.lineId);
  // El equipo actual de la línea se ofrece aunque ya no esté entre los activos.
  const equipmentOptions: SelectOption[] =
    state.mode === 'update' &&
    line?.equipmentId &&
    !equipment.some((option) => option.id === line.equipmentId)
      ? [{ id: line.equipmentId, label: line.equipmentLabel ?? line.equipmentId }, ...equipment]
      : [...equipment];

  function reset() {
    setState(initialFormState(lines));
    setErrors({});
    setGeneral(undefined);
    setReload(false);
    setChangingProduct(false);
  }

  async function submit() {
    if (busy) return;
    const built = buildInput(state, { id: requestId, version });
    if (!built.ok) {
      setErrors(built.errors);
      setGeneral(undefined);
      return;
    }
    setBusy(true);
    setErrors({});
    setGeneral(undefined);
    let navigating = false;
    try {
      const result = await correctLineAction(built.input);
      if (!result.ok) {
        setErrors(serverFieldErrors(result.error.fieldErrors));
        setGeneral(result.error.message);
        setReload(
          result.error.code === 'CONFLICT' ||
            result.error.code === 'INVALID_TRANSITION' ||
            result.error.reason === 'stale_version',
        );
        return;
      }
      navigating = true;
      setOpen(false);
      router.replace(`/solicitudes/${requestId}?corregido=1`);
      router.refresh();
    } catch {
      setGeneral(messages.errors.codes.INTERNAL);
    } finally {
      // Al navegar se deja el botón ocupado para que no se pueda enviar dos veces.
      if (!navigating) setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size={large ? 'lg' : 'default'} className={className}>
          {messages.requests.detail.actions.correct_line}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title(number)}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormError message={general} />

          <div role="group" aria-label={t.modeLabel} className="grid grid-cols-3 gap-2">
            {MODES.map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={state.mode === mode ? 'default' : 'outline'}
                aria-pressed={state.mode === mode}
                onClick={() => {
                  setState((prev) => selectMode(prev, mode, lines));
                  setErrors({});
                  setChangingProduct(false);
                }}
              >
                {t.modes[mode]}
              </Button>
            ))}
          </div>

          {state.mode !== 'add' ? (
            <Field
              label={t.lineLabel}
              htmlFor={`${ids}-line`}
              errorId={`${ids}-line-error`}
              error={errors.lineId}
            >
              <NativeSelect
                id={`${ids}-line`}
                value={state.lineId}
                aria-invalid={errors.lineId ? true : undefined}
                aria-describedby={errors.lineId ? `${ids}-line-error` : undefined}
                onChange={(event) => {
                  setState((prev) => selectLine(prev, event.target.value, lines));
                  setChangingProduct(false);
                }}
              >
                {lines.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t.lineOption(item.lineNo, item.productCode, item.description)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {state.mode === 'remove' ? (
            <p className="text-sm text-muted-foreground">{t.removeWarning}</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-status-neutral-fg">
                  {t.productLabel}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm break-words">
                    {state.productId ? state.productLabel : t.noProduct}
                  </span>
                  {state.productId !== '' ? (
                    <Button
                      type="button"
                      variant="outline"
                      aria-expanded={showPicker}
                      onClick={() => setChangingProduct((value) => !value)}
                    >
                      {changingProduct ? t.cancelChangeProduct : t.changeProduct}
                    </Button>
                  ) : null}
                </div>
                {errors.productId ? (
                  <p role="alert" className="text-[13px] text-destructive">
                    {errors.productId}
                  </p>
                ) : null}
              </div>
              {showPicker ? (
                // Enter en el buscador no debe enviar la corrección.
                <div
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                >
                  <CatalogSearch
                    pick
                    title={t.pickProduct}
                    currency={currency}
                    onAdd={(product) => {
                      setState((prev) =>
                        pickProduct(prev, {
                          id: product.id,
                          code: product.code,
                          name: product.name,
                          referencePrice: product.referencePrice,
                        }),
                      );
                      setChangingProduct(false);
                    }}
                  />
                </div>
              ) : null}

              <Field
                label={t.equipmentLabel}
                htmlFor={`${ids}-equipment`}
                errorId={`${ids}-equipment-error`}
                error={errors.equipmentId}
              >
                <NativeSelect
                  id={`${ids}-equipment`}
                  value={state.equipmentId}
                  onChange={(event) => patch({ equipmentId: event.target.value })}
                >
                  <option value="">{messages.requests.general.noEquipment}</option>
                  {equipmentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t.quantityLabel}
                  htmlFor={`${ids}-quantity`}
                  errorId={`${ids}-quantity-error`}
                  error={errors.quantity}
                  required
                >
                  <Input
                    id={`${ids}-quantity`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={state.quantity}
                    aria-invalid={errors.quantity ? true : undefined}
                    aria-describedby={errors.quantity ? `${ids}-quantity-error` : undefined}
                    onChange={(event) => patch({ quantity: event.target.value })}
                  />
                </Field>
                <Field
                  label={t.priceLabel}
                  htmlFor={`${ids}-price`}
                  errorId={`${ids}-price-error`}
                  error={errors.unitPrice}
                  required
                >
                  <Input
                    id={`${ids}-price`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={state.unitPrice}
                    aria-invalid={errors.unitPrice ? true : undefined}
                    aria-describedby={errors.unitPrice ? `${ids}-price-error` : undefined}
                    onChange={(event) => patch({ unitPrice: event.target.value })}
                  />
                </Field>
              </div>

              <Field
                label={t.notesLabel}
                htmlFor={`${ids}-notes`}
                errorId={`${ids}-notes-error`}
                error={errors.notes}
              >
                <Textarea
                  id={`${ids}-notes`}
                  rows={2}
                  autoComplete="off"
                  value={state.notes}
                  aria-invalid={errors.notes ? true : undefined}
                  aria-describedby={errors.notes ? `${ids}-notes-error` : undefined}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </Field>
            </>
          )}

          <Field
            label={t.reasonLabel}
            htmlFor={`${ids}-reason`}
            errorId={`${ids}-reason-error`}
            error={errors.reason}
          >
            <Textarea
              id={`${ids}-reason`}
              rows={3}
              autoComplete="off"
              placeholder={t.reasonPlaceholder}
              value={state.reason}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? `${ids}-reason-error` : undefined}
              onChange={(event) => patch({ reason: event.target.value })}
            />
            <p
              className={cn(
                'text-[13px] text-muted-foreground',
                used > CORRECTION_REASON_MAX && 'text-danger',
              )}
            >
              {t.counter(used, CORRECTION_REASON_MAX)}
            </p>
          </Field>

          {/* Orden en el DOM = orden de tabulación: Guardar, Volver, Recargar. Desde sm se invierte
              la fila para dejar la acción principal a la derecha. */}
          <DialogFooter className="flex-col sm:flex-row-reverse sm:justify-start">
            <Button type="submit" disabled={busy}>
              {busy ? t.submitting : t.submit[state.mode]}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.back}
            </Button>
            {reload ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                {t.reload}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
