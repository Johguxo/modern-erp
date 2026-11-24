import { formatMoney, type CurrencyCode } from '@/ui/format/money';
import { cn } from '@/ui/lib/utils';

export function MoneyText({
  amount,
  currency,
  maxFractionDigits,
  className,
}: {
  /** Monto como string decimal (por ejemplo, "1860.50"). */
  amount: string;
  currency: CurrencyCode;
  /** Decimales máximos (mínimo 2). Por defecto 2. */
  maxFractionDigits?: number;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatMoney(amount, currency, { maxFractionDigits })}
    </span>
  );
}
