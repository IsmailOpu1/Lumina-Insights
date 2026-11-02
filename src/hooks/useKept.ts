import { useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { KeptStore } from '@/lib/keptWork';

/** The store's state for the signed-in user, and a setter for it. */
export function useKept<T extends object>(store: KeptStore<T>) {
  const { user } = useAuth();
  store.load(user?.id ?? null);
  const state = useSyncExternalStore(store.subscribe, store.get);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useMemo(() => store.setter(), [store, store.epoch]);
  return [state, set] as const;
}
