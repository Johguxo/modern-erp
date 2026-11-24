import { messages } from '@/ui/messages/es-PE';

/** Aviso de empresa en solo lectura (ADR-006): suspendida, cancelada o sin suscripción. */
export function ReadOnlyBanner() {
  return (
    <div
      role="status"
      className="border-b border-warning-border bg-warning-bg px-4 py-2 text-warning-text md:px-10"
    >
      {messages.readOnly.banner}
    </div>
  );
}
