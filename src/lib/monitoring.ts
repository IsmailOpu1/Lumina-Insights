// Error reporting through Sentry. Off until VITE_SENTRY_DSN is set; when it
// is, about 32 KB (gzip) of Sentry downloads after the page has started.
// Errors only: no session recordings, no performance tracing, no emails.

type Sentry = typeof import('./sentryClient');

let sentry: Promise<Sentry | null> = Promise.resolve(null);

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || import.meta.env.DEV) return;
  sentry = import('./sentryClient')
    .then((S) => {
      S.init({
        dsn,
        environment: import.meta.env.MODE,
        // Requests carry business data and URLs can carry invite tokens:
        // collect none of it. The account id is set by setMonitoringUser.
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
        tracesSampleRate: 0,
        // Noise from browser extensions and flaky connections, not our bugs.
        ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', 'Load failed'],
        denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//],
        // Console output can echo business data; keep it out of reports.
        beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
      });
      return S;
    })
    .catch(() => null);
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  sentry.then((S) => S?.captureException(error, context ? { extra: context } : undefined));
}

/** Tags reports with the account id (never the email) so issues can be traced. */
export function setMonitoringUser(id: string | null) {
  sentry.then((S) => S?.setUser(id ? { id } : null));
}
