import { Skeleton } from '@/ui/components/skeleton';
import { messages } from '@/ui/messages/es-PE';

export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{messages.states.loading}</span>
      <Skeleton className="mb-6 h-9 w-64" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
