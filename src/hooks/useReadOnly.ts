import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';

/**
 * True when the current user can't add or change data: viewers, workspaces
 * whose plan has expired, and team members while the workspace isn't on Pro.
 * Hides write buttons; the database enforces the same rules.
 */
export function useReadOnly() {
  const { isViewer } = useAuth();
  const { canWrite } = useSubscription();
  return isViewer || !canWrite;
}
