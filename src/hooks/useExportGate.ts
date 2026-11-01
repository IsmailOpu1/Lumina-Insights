import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tr } from '@/i18n';
import { useSubscription } from '@/context/SubscriptionContext';

/**
 * Returns a check to run before exporting: true when the plan includes Excel
 * export; otherwise explains why not (with a link to Billing for owners).
 */
export function useExportGate() {
  const { features, canWrite, subscription } = useSubscription();
  const navigate = useNavigate();

  return useCallback(() => {
    if (features.dataExport) return true;
    const isOwner = subscription?.is_owner ?? false;
    const reason = canWrite ? tr('Excel export is a Pro feature.') : tr('Your plan has expired.');
    toast.error(reason, {
      description: isOwner ? undefined : tr('Ask the workspace owner to upgrade.'),
      action: isOwner ? { label: tr('See plans'), onClick: () => navigate('/billing') } : undefined,
    });
    return false;
  }, [features.dataExport, canWrite, subscription?.is_owner, navigate]);
}
