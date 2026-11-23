'use client';

import { messages } from '@/ui/messages/es-PE';

// Último recurso si falla el layout raíz: sin estilos de la app, solo texto en es-PE.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-PE">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <h1>{messages.states.errorTitle}</h1>
        <p>{messages.states.errorDescription}</p>
        {error.digest ? (
          <p>
            {messages.errors.reference}: {error.digest}
          </p>
        ) : null}
        <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 16px' }}>
          {messages.states.retry}
        </button>
      </body>
    </html>
  );
}
