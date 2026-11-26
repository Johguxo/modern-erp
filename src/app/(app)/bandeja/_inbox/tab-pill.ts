// Estilo de las pestañas tipo píldora de la bandeja (prototipo Main.dc.html): 44 px de alto.
import { cn } from '@/ui/lib/utils';

export function tabPillClass(active: boolean): string {
  return cn(
    'inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    active
      ? 'border-primary bg-primary-soft font-semibold text-primary'
      : 'border-border-strong bg-surface font-medium text-ink-2 hover:bg-primary-soft',
  );
}
