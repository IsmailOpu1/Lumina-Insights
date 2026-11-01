import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';

/** Chrome's install event; not in the DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/**
 * Registers the service worker and keeps the browser's install offer for the
 * Install app buttons. Runs before React: Chrome can fire the offer early.
 */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad, including iPads that report themselves as a Mac. */
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Whether Lumina can be installed here, and how. Chrome and Edge offer
 * their own install prompt; iPhones only allow Share → Add to Home Screen.
 */
export function useInstallApp() {
  const offer = useSyncExternalStore(subscribe, () => deferred, () => null);
  const ios = isIOS();
  const available = !isStandalone() && (offer !== null || ios);

  async function install() {
    if (deferred) {
      const event = deferred;
      // An offer can only be shown once.
      deferred = null;
      changed();
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') toast.success('Lumina is on your home screen');
      return;
    }
    if (ios) {
      toast('Add Lumina to your home screen', {
        description: 'In Safari, tap the Share button, then "Add to Home Screen".',
        duration: 10000,
      });
    }
  }

  return { available, install };
}
