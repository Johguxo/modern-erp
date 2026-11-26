'use client';

// Editor de SOF (E3-H2): una sola pantalla para crear y editar borradores, fiel a NuevoSOF.dc.html.
// El estado vive en un reducer puro (editor-state.ts); el total en vivo sale de las funciones
// decimal.js del dominio. Guardar y enviar son dos llamadas: si el envío falla, el borrador queda
// guardado.
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { RoutePreview } from '@/modules/approvals';
import type { RequestView } from '@/modules/requests';
import type { Currency } from '@/modules/requests/contracts';
import { FormError } from '@/ui/forms/form-error';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import {
  createDraftAction,
  previewRouteAction,
  submitRequestAction,
  updateDraftAction,
} from '../actions';

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
type RouteStatus = 'idle' | 'updating' | 'error';

const ROUTE_DEBOUNCE_MS = 400;

export function RequestEditor({
  initial,
  costCenters,
  equipment,
  route: initialRoute,
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
  const resubmitting = initial?.status === 'changes_requested';
  const totals = useMemo(() => computeTotals(state.lines), [state.lines]);
  const [route, setRoute] = useState<RoutePreview>(initialRoute);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle');
  // El total con el que se calculó la ruta que se ve: la carga inicial viene del servidor.
  const routeTotal = useRef<string | null>(initial ? initial.totalAmount : null);

  // La ruta depende del monto: se recalcula cuando cambia el total en vivo (con espera y
  // descartando respuestas viejas, como el buscador). La carga inicial no llama.
  useEffect(() => {
    const total = totals.total;
    if (total === null || total === routeTotal.current) {
      setRouteStatus('idle');
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      setRouteStatus('updating');
      previewRouteAction({ docType: 'SOF', total })
        .then((result) => {
          if (stale) return;
          if (result.ok) {
            routeTotal.current = total;
            setRoute(result.data);
            setRouteStatus('idle');
          } else {
            setRouteStatus('error');
          }
        })
        .catch(() => {
          if (!stale) setRouteStatus('error');
        });
    }, ROUTE_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [totals.total]);

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
      if (await persist()) {
        dispatch({
          type: 'setNotice',
          notice: resubmitting
            ? messages.requests.notices.changesSaved
            : messages.requests.notices.saved,
        });
      }
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
      router.push(`/solicitudes/${saved.id}?${resubmitting ? 'reenviado' : 'enviado'}=1` as Route);
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
      <fieldset
        disabled={busy !== null || readOnly}
        className="m-0 flex min-w-0 flex-[999_1_520px] flex-col gap-5 border-0 p-0"
      >
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
      </fieldset>

      <ApprovalRoutePanel
        route={route}
        requesterEmail={requesterEmail}
        status={routeStatus === 'idle' ? undefined : routeStatus}
      >
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
          {busy === 'submit'
            ? resubmitting
              ? t.resubmitting
              : t.submitting
            : resubmitting
              ? t.resubmit
              : t.submit}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void saveDraft()}
        >
          {busy === 'save' ? t.saving : resubmitting ? t.saveChanges : t.saveDraft}
        </Button>
      </ApprovalRoutePanel>
    </div>
  );
}
