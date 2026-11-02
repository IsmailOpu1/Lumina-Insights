import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { tr } from '@/i18n';

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
  if (import.meta.env.PROD) watchForUpdates();
}

const APP_SCRIPT = /\/assets\/index-[\w-]+\.js/;
const CHECK_EVERY_MS = 15 * 60 * 1000;

/** The app script a fresh copy of the site would load, if it differs from the running one. */
export function newerScript(freshHtml: string, running: string | null): string | null {
  const fresh = freshHtml.match(APP_SCRIPT)?.[0] ?? null;
  return fresh && running && fresh !== running ? fresh : null;
}

/**
 * A tab or installed app left open keeps running the version it loaded, so
 * a release never reached it until a reload. Check for a newer build when
 * the seller comes back to the app and every so often, and offer a refresh.
 */
function watchForUpdates() {
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
    ?.getAttribute('src')?.match(APP_SCRIPT)?.[0] ?? null;
  if (!running) return;
  let offered = false;

  async function check() {
    if (offered || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/', { cache: 'no-store' });
      if (!res.ok || !newerScript(await res.text(), running)) return;
      offered = true;
      toast(tr('A new version of Lumina is ready'), {
        description: tr('Refresh to get the latest changes.'),
        duration: Infinity,
        action: { label: tr('Refresh'), onClick: () => window.location.reload() },
      });
    } catch { /* offline: try again later */ }
  }

  document.addEventListener('visibilitychange', check);
  window.setInterval(check, CHECK_EVERY_MS);
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
      if (outcome === 'accepted') toast.success(tr('Lumina is on your home screen'));
      return;
    }
    if (ios) {
      toast(tr('Add Lumina to your home screen'), {
        description: tr('In Safari, tap the Share button, then "Add to Home Screen".'),
        duration: 10000,
      });
    }
  }

  return { available, install };
}
