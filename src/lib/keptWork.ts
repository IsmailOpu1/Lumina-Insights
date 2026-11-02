/**
 * Work in progress that should not be lost when the seller moves to another
 * page, the phone reloads the app in the background, or the page is
 * refreshed: an AI chat, a Marketing AI brief, a half-filled form.
 *
 * Each store keeps its state in memory, so an answer that arrives after the
 * seller left the page still lands, and copies it to this browser's storage
 * under the signed-in user's id, so a manager on another device never sees
 * the owner's work. Everything is wiped on sign-out.
 */

const PREFIX = 'lumina-kept:';

interface Saved<T> { at: number; value: T }

interface Options<T> {
  /** Older than this, the saved copy is dropped on load. */
  maxAgeMs?: number;
  /** What to save; leave out fields that are only true while the page runs. */
  toSaved?: (state: T) => Partial<T>;
  /** Adjusts a state loaded from storage (e.g. a request that never finished). */
  fromSaved?: (state: T) => T;
}

export interface KeptStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
  /** Moves the store to this user, loading their saved state. */
  load(userId: string | null): void;
  /** A setter that does nothing once the store has moved to another user. */
  setter(): (update: Partial<T> | ((state: T) => Partial<T>)) => void;
  /** Back to the initial state, and the saved copy removed. */
  reset(): void;
  readonly epoch: number;
}

const stores = new Set<KeptStore<unknown>>();

function storageKey(userId: string, name: string) {
  return `${PREFIX}${userId}:${name}`;
}

function readStorage<T>(key: string, maxAgeMs?: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved<T>;
    if (maxAgeMs && Date.now() - saved.at > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return saved.value;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch { /* storage full or blocked: the work is still kept in memory */ }
}

function removeStorage(key: string) {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

export function createKeptStore<T extends object>(name: string, initial: () => T, options: Options<T> = {}): KeptStore<T> {
  let userId: string | null = null;
  let state = initial();
  let epoch = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const save = () => {
    if (!userId) return;
    writeStorage(storageKey(userId, name), options.toSaved ? options.toSaved(state) : state);
  };

  const store: KeptStore<T> = {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load(next) {
      if (next === userId) return;
      userId = next;
      epoch += 1;
      const saved = next ? readStorage<Partial<T>>(storageKey(next, name), options.maxAgeMs) : null;
      state = saved ? { ...initial(), ...saved } : initial();
      if (saved && options.fromSaved) state = options.fromSaved(state);
      emit();
    },
    setter() {
      const at = epoch;
      return (update) => {
        if (at !== epoch) return;
        state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
        save();
        emit();
      };
    },
    reset() {
      if (userId) removeStorage(storageKey(userId, name));
      epoch += 1;
      state = initial();
      emit();
    },
    get epoch() { return epoch; },
  };
  stores.add(store as KeptStore<unknown>);
  return store;
}

/** Forgets every kept piece of work, in memory and in this browser. Called on sign-out. */
export function clearKeptWork() {
  stores.forEach((s) => s.load(null));
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* blocked */ }
}
