import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { Subscription } from '@/lib/subscription';

interface SubscriptionContextType {
  subscription: Subscription | null;
  loading: boolean;
  /** False once the trial or paid period has lapsed (the workspace is read-only). */
  canWrite: boolean;
  /** Plan-gated features; trials get everything Pro has. */
  features: { dataExport: boolean; weeklySummary: boolean };
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { ownerIdForQueries } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ownerIdForQueries) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('get_my_subscription');
    if (error) console.error('get_my_subscription failed:', error.message);
    setSubscription((data as unknown as Subscription | null) ?? null);
    setLoading(false);
  }, [ownerIdForQueries]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // While loading or before a subscription exists (mid-onboarding), don't
  // lock the UI; the database still enforces the real rules.
  const canWrite = !subscription || subscription.state !== 'expired';
  const features = {
    dataExport: !subscription || (canWrite && subscription.limits.data_export),
    weeklySummary: !!subscription && canWrite && subscription.limits.weekly_summary,
  };

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, canWrite, features, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
