import * as React from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * Selector nativo del navegador, con el aspecto de los inputs. Se usa donde el prototipo trae un
 * <select> simple y hay muchos en pantalla (por ejemplo, uno por línea del SOF): en el celular
 * abre la lista del sistema y en las pruebas se maneja con selectOption.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
