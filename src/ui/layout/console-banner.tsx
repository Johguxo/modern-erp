import { messages } from '@/ui/messages/es-PE';

/** Franja de la consola de SuperAdmin (mapa-pantallas.md: layout admin). */
export function ConsoleBanner() {
  return (
    <div className="bg-primary px-4 py-2 text-center text-xs font-semibold tracking-wide text-primary-foreground uppercase md:px-10">
      {messages.admin.consoleBanner}
    </div>
  );
}
