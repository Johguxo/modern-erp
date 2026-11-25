import { Skeleton } from '@/ui/components/skeleton';
import { messages } from '@/ui/messages/es-PE';

// Esqueleto del editor: encabezado, tres tarjetas a la izquierda y el panel de ruta a la derecha.
export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{messages.states.loading}</span>
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <Skeleton className="h-72 min-w-0 flex-[1_1_280px] rounded-xl" />
      </div>
    </div>
  );
}
