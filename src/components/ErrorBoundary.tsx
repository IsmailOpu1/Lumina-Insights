import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportError } from '@/lib/monitoring';
import { whatsAppSupportLink } from '@/lib/support';

const RELOADED_KEY = 'lumina-chunk-reload';

// After a deploy, a tab opened earlier asks for page files that no longer
// exist. Reloading once picks up the new version.
function isStaleBuild(error: Error) {
  return /dynamically imported module|Importing a module script failed|Failed to fetch.*\.js|ChunkLoadError/i.test(error.message);
}

interface State {
  error: Error | null;
}

/** Shows a way out instead of a blank screen when a page crashes. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleBuild(error)) {
      try {
        if (!sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, '1');
          window.location.reload();
          return;
        }
      } catch { /* storage unavailable: show the screen instead */ }
    }
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const support = whatsAppSupportLink('Hi Lumina, the app showed "Something went wrong" when I');
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="surface w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="text-destructive" size={28} />
          </div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your data is safe. Reloading the page usually fixes this. We've been told about the problem.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw size={16} /> Reload the page
          </button>
          {support && (
            <p className="mt-4 text-sm">
              <a href={support} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Still stuck? Message us on WhatsApp
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }
}
