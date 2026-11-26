'use client';

// «Reenviar a aprobación» del detalle (E4-H2): el solicitante envía de nuevo la solicitud con
// «Cambios solicitados». Al reenviar, la página se recarga con ?reenviado=1 para mostrar el aviso.
// Si el documento cambió, ofrece «Recargar» en vez de reintentar a ciegas.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/ui/components/button';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { submitRequestAction } from '../../actions';

const t = messages.requests;

export function ResubmitButton({
  requestId,
  version,
  large = false,
  className,
}: {
  requestId: string;
  /** Versión del documento que vio la página: el reenvío falla si cambió. */
  version: number;
  large?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);

  async function resubmit() {
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      const result = await submitRequestAction({ id: requestId, version });
      if (!result.ok) {
        setError({
          message: result.error.message,
          reload: result.error.code === 'CONFLICT' || result.error.code === 'INVALID_TRANSITION',
        });
        return;
      }
      navigating = true;
      router.replace(`/solicitudes/${requestId}?reenviado=1`);
      router.refresh();
    } catch {
      setError({ message: messages.errors.codes.INTERNAL, reload: false });
    } finally {
      // Al navegar se deja el botón ocupado para que no se pueda reenviar dos veces.
      if (!navigating) setBusy(false);
    }
  }

  return (
    <>
      <FormError message={error?.message} />
      {error?.reload ? (
        <Button type="button" variant="outline" onClick={() => router.refresh()}>
          {t.actions.reload}
        </Button>
      ) : null}
      <Button
        type="button"
        size={large ? 'lg' : 'default'}
        className={className}
        disabled={busy}
        onClick={() => void resubmit()}
      >
        {busy ? t.actions.resubmitting : t.detail.actions.resubmit}
      </Button>
    </>
  );
}
