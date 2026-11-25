// Migas y título del editor de SOF (NuevoSOF.dc.html): "Bandeja / Nueva solicitud".
import Link from 'next/link';

import { messages } from '@/ui/messages/es-PE';

const t = messages.requests;

export function EditorHeader({ mode }: { mode: 'new' | 'edit' }) {
  return (
    <header className="mb-6">
      <nav aria-label={t.breadcrumbLabel} className="mb-1 text-[13px] text-muted-foreground">
        <Link href="/bandeja" className="text-primary hover:text-primary-hover">
          {t.breadcrumbInbox}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{mode === 'new' ? t.breadcrumbNew : t.breadcrumbEdit}</span>
      </nav>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {t.title}
      </h1>
      <p className="mt-1.5 text-muted-foreground">{t.description}</p>
    </header>
  );
}
