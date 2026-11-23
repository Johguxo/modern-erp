import Link from 'next/link';

import { EmptyState } from '@/ui/base/empty-state';
import { messages } from '@/ui/messages/es-PE';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        className="w-full max-w-lg"
        title={messages.states.notFoundTitle}
        description={messages.states.notFoundDescription}
        action={
          <Link
            href="/bandeja"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {messages.states.backToInbox}
          </Link>
        }
      />
    </main>
  );
}
