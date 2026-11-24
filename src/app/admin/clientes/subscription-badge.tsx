import type { TenantSubscriptionView } from '@/modules/identity';
import { StatusBadge } from '@/ui/base/status-badge';

/** Estado de la suscripción con texto (nunca solo color). */
export function SubscriptionBadge({ status }: { status: TenantSubscriptionView['status'] | null }) {
  return <StatusBadge status={status ? `subscription_${status}` : 'subscription_none'} />;
}
