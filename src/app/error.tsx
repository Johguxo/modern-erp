'use client';

import { ErrorState } from '@/ui/base/error-state';

// Nunca se muestra error.message: solo el digest como código de referencia.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="p-4 md:px-10 md:py-8">
      <ErrorState reference={error.digest} onRetry={reset} />
    </main>
  );
}
