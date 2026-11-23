import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

// Página de relleno para ver el layout; la consola real llega en E1-H4.
export default function AdminPage() {
  return (
    <>
      <PageHeader title={messages.admin.title} />
      <EmptyState title={messages.admin.emptyTitle} description={messages.admin.emptyDescription} />
    </>
  );
}
