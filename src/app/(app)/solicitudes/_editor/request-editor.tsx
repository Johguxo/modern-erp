'use client';

// Editor de SOF (E3-H2): una sola pantalla para crear y editar borradores, fiel a NuevoSOF.dc.html.
// El estado vive en un reducer puro (editor-state.ts); el total en vivo sale de las funciones
// decimal.js del dominio. Guardar y enviar son dos llamadas: si el envío falla, el borrador queda
// guardado.
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useMemo, useReducer, useState } from 'react';

import type { RoutePreview } from '@/modules/approvals';
import type { RequestView } from '@/modules/requests';
import type { Currency } from '@/modules/requests/contracts';
import { FormError } from '@/ui/forms/form-error';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { createDraftAction, submitRequestAction, updateDraftAction } from '../actions';

import { ApprovalRoutePanel } from './approval-route-panel';
import { CatalogSearch } from './catalog-search';
import {
  computeTotals,
  emptyState,
  errorsFromAction,
  errorsFromFields,
  fromRequestView,
  hasErrors,
  reducer,
  toDraftInput,
  validateForSave,
  validateForSubmit,
} from './editor-state';
import { HeaderFields } from './header-fields';
import { LineItems } from './line-items';
import type { SelectOption } from './load-editor-data';

const t = messages.requests.actions;

type Busy = 'save' | 'submit' | null;

export function RequestEditor({
  initial,
  costCenters,
  equipment,
  route,
  currency,
  requesterEmail,
  readOnly,
}: {
  /** Borrador a editar; null para una solicitud nueva. */
  initial: RequestView | null;
  costCenters: SelectOption[];
  equipment: SelectOption[];
  route: RoutePreview;
  currency: Currency;
  requesterEmail: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initial, (view) =>
    view ? fromRequestView(view) : emptyState(),
  );
  const [busy, setBusy] = useState<Busy>(null);
  const totals = useMemo(() => computeTotals(state.lines), [state.lines]);

  /** Crea o actualiza el borrador y refleja lo que guardó el servidor. Null si falló. */
  async function persist(): Promise<RequestView | null> {
    const input = toDraftInput(state);
    const result =
      state.id !== null && state.version !== null
        ? await updateDraftAction({ ...input, id: state.id, version: state.version })
        : await createDraftAction(input);
    if (!result.ok) {
      dispatch({ type: 'setErrors', errors: errorsFromAction(result.error) });
      return null;
    }
    dispatch({ type: 'loaded', request: result.data });
    if (state.id === null) {
      // La URL pasa a /editar sin recargar: el estado de la pantalla no se pierde.
      window.history.replaceState(null, '', `/solicitudes/${result.data.id}/editar`);
    }
    return result.data;
  }

  async function saveDraft() {
    const invalid = validateForSave(state);
    if (hasErrors(invalid)) {
      dispatch({ type: 'setErrors', errors: errorsFromFields(invalid) });
      return;
    }
    setBusy('save');
    try {
      if (await persist()) dispatch({ type: 'setNotice', notice: messages.requests.notices.saved });
    } catch {
      dispatch({
        type: 'setErrors',
        errors: { reload: false, general: messages.errors.codes.INTERNAL, fields: {} },
      });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const invalid = validateForSubmit(state);
    if (hasErrors(invalid)) {
      dispatch({ type: 'setErrors', errors: errorsFromFields(invalid) });
      return;
    }
    setBusy('submit');
    let navigating = false;
    try {
      const saved = await persist();
      if (!saved) return;
      const sent = await submitRequestAction({ id: saved.id, version: saved.version });
      if (!sent.ok) {
        dispatch({ type: 'setErrors', errors: errorsFromAction(sent.error) });
        return;
      }
      navigating = true;
      router.push(`/solicitudes/${saved.id}` as Route);
    } catch {
      dispatch({
        type: 'setErrors',
        errors: { reload: false, general: messages.errors.codes.INTERNAL, fields: {} },
      });
    } finally {
      // Al navegar se deja el estado ocupado para que no se pueda enviar dos veces.
      if (!navigating) setBusy(null);
    }
  }

  const disabled = readOnly || busy !== null;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <HeaderFields
          state={state}
          requesterEmail={requesterEmail}
          costCenters={costCenters}
          equipment={equipment}
          dispatch={dispatch}
        />
        <CatalogSearch
          currency={currency}
          onAdd={(product) => dispatch({ type: 'addProduct', product })}
        />
        <LineItems
          lines={state.lines}
          errors={state.errors}
          totals={totals}
          currency={currency}
          equipment={equipment}
          dispatch={dispatch}
        />
      </div>

      <ApprovalRoutePanel route={route} requesterEmail={requesterEmail}>
        {state.notice ? (
          <p role="status" className="rounded-md border border-border bg-surface px-3 py-2">
            {state.notice}
          </p>
        ) : null}
        <FormError message={state.errors.general} />
        {state.errors.reload ? (
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            {t.reload}
          </Button>
        ) : null}
        <Button type="button" size="lg" disabled={disabled} onClick={() => void submit()}>
          {busy === 'submit' ? t.submitting : t.submit}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void saveDraft()}
        >
          {busy === 'save' ? t.saving : t.saveDraft}
        </Button>
      </ApprovalRoutePanel>
    </div>
  );
}
