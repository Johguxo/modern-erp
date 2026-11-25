// «Importar desde Excel»: deshabilitado hasta E2-H3, con el motivo escrito al lado (no en un
// tooltip, que no se ve en el móvil ni con teclado).
import { useId } from 'react';

import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

export function ImportButton() {
  const soonId = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" disabled aria-describedby={soonId}>
        {messages.catalog.import}
      </Button>
      <span id={soonId} className="text-sm text-muted-foreground">
        {messages.catalog.importSoon}
      </span>
    </span>
  );
}
