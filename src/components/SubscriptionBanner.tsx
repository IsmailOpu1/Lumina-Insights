import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { useSubscription } from '@/context/SubscriptionContext';
import { daysUntil } from '@/lib/subscription';

const TRIAL_WARNING_DAYS = 3;

// Warns near the end of a trial and explains read-only mode after it.
export default function SubscriptionBanner() {
  const { subscription } = useSubscription();
  if (!subscription) return null;

  const action = subscription.is_owner
    ? <Link to="/billing" className="font-extrabold underline underline-offset-2">Choose a plan</Link>
    : <span className="font-bold">Ask the workspace owner to choose a plan.</span>;

  if (subscription.member_access_suspended) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          Team access is a Pro feature, and this workspace isn't on Pro right now. Ask the workspace owner
          to upgrade to Pro to restore your access.
        </span>
      </div>
    );
  }

  if (subscription.state === 'expired') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <AlertTriangle size={16} className="shrink-0" />
        <span>Your plan has expired, so this workspace is read-only. Your data is safe.</span>
        {action}
      </div>
    );
  }

  if (subscription.state === 'trialing') {
    const days = daysUntil(subscription.trial_ends_at);
    if (days > TRIAL_WARNING_DAYS) return null;
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 bg-[#F59E0B] px-4 py-2 text-sm text-black">
        <Clock size={16} className="shrink-0" />
        <span>Your free trial ends {days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}.</span>
        {action}
      </div>
    );
  }

  return null;
}
