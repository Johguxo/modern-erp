import { Skeleton } from '@/ui/components/skeleton';
import { messages } from '@/ui/messages/es-PE';

// Esqueleto de la bandeja: encabezado, tres tarjetas y la tarjeta con pestañas y tabla.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{messages.states.loading}</span>
      <div>
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Skeleton className="h-24 rounded-xl sm:h-28" />
        <Skeleton className="h-24 rounded-xl sm:h-28" />
        <Skeleton className="h-24 rounded-xl sm:h-28" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
