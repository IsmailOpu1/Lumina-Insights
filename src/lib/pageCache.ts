import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

// What each page last loaded, kept in memory while the app is open, so going
// back to a page shows it at once while it quietly refreshes. It belongs to one
// signed-in user: AuthContext empties it on sign-out and whenever the user changes.
const store = new Map<string, unknown>();
let owner: string | null = null;

export function clearPageCache() {
  store.clear();
}

/** Called by AuthContext with the signed-in user's id (or null). */
export function setPageCacheUser(userId: string | null) {
  if (userId !== owner) store.clear();
  owner = userId;
}

/**
 * useState that remembers its value for the next visit to the page.
 * `cached` says whether a remembered value was there, so the page can skip its
 * loading skeleton. A new `name` (for example another date range) switches to
 * that name's remembered value, or back to `initial`.
 */
export function useCachedState<T>(name: string, initial: T) {
  const key = name;
  const initialRef = useRef(initial);
  const [current, setCurrent] = useState(() => ({
    key,
    value: (store.has(key) ? store.get(key) : initial) as T,
  }));

  let value = current.value;
  if (current.key !== key) {
    // Switched to another key: show what is remembered for it, if anything.
    value = (store.has(key) ? store.get(key) : initialRef.current) as T;
    setCurrent({ key, value });
  }

  // Remember everything but the starting placeholder, which isn't real data.
  useEffect(() => {
    if (current.value !== initialRef.current) store.set(current.key, current.value);
  }, [current]);

  // Bound to this render's key: a load that finishes after the page moved on
  // to another key is remembered for its own key and not shown.
  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setCurrent((c) => {
      if (c.key !== key) {
        if (typeof next !== 'function') store.set(key, next);
        return c;
      }
      return { key, value: typeof next === 'function' ? (next as (prev: T) => T)(c.value) : next };
    });
  }, [key]);

  return [value, setValue, store.has(key) || value !== initialRef.current] as const;
}
