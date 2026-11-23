import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

// Página de relleno para ver el layout; la bandeja real llega en E3-H3.
export default function InboxPage() {
  return (
    <>
      <PageHeader title={messages.inbox.title} />
      <EmptyState title={messages.inbox.emptyTitle} description={messages.inbox.emptyDescription} />
    </>
  );
}
