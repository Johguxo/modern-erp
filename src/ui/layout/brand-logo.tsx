// Logo provisional de LinkUs (design-tokens.md): ícono de eslabón + "LinkUs" en Space Grotesk.
import { Link2 } from 'lucide-react';

import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

export function BrandLogo({
  tone = 'dark',
  className,
}: {
  /** dark: sobre el menú oscuro; light: sobre fondo claro. */
  tone?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Link2 aria-hidden className="size-6 text-brand-accent" />
      <span
        className={cn(
          'font-heading text-xl font-bold',
          tone === 'dark' ? 'text-surface' : 'text-foreground',
        )}
      >
        {messages.app.name}
      </span>
    </span>
  );
}
