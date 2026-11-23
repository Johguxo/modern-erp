import { formatMoney, type CurrencyCode } from '@/ui/format/money';
import { cn } from '@/ui/lib/utils';

export function MoneyText({
  amount,
  currency,
  className,
}: {
  /** Monto como string decimal (por ejemplo, "1860.50"). */
  amount: string;
  currency: CurrencyCode;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}
