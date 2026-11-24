// Marca del cliente en el pie del menú (E1-H5, prototipo Main.dc.html): logo o iniciales sobre el
// color principal, y el nombre visible.
import { readableTextTone } from '@/ui/format/color';
import { cn } from '@/ui/lib/utils';

export interface TenantBrandProps {
  readonly displayName: string;
  readonly primaryColor: string | null;
  readonly logoUrl: string | null;
}

const DEFAULT_ACCENT = '#38BDF8';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2);
  return letters.toUpperCase();
}

export function TenantBrand({ displayName, primaryColor, logoUrl }: TenantBrandProps) {
  const color = primaryColor ?? DEFAULT_ACCENT;
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="tenant-brand">
      {logoUrl ? (
        // Logo de Storage (otro origen, sin next/image para no configurar remotePatterns).
        // El nombre va al lado: la imagen es decorativa.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 max-w-24 shrink-0 object-contain" />
      ) : (
        <span
          aria-hidden="true"
          data-testid="tenant-monogram"
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold',
            readableTextTone(color) === 'light' ? 'text-white' : 'text-ink',
          )}
          style={{ backgroundColor: color }}
        >
          {initials(displayName)}
        </span>
      )}
      <span className="truncate text-sm font-medium text-nav-text">{displayName}</span>
    </div>
  );
}

/** Variable CSS del acento del cliente (el valor ya viene validado como #RRGGBB). */
export function accentStyle(
  primaryColor: string | null | undefined,
): React.CSSProperties | undefined {
  return primaryColor ? ({ '--tenant-accent': primaryColor } as React.CSSProperties) : undefined;
}
