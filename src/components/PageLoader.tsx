import { Sparkles } from 'lucide-react';
import SkeletonLoader from '@/components/SkeletonLoader';

// Shown while a page's code chunk downloads. Inside the app shell only the
// content area waits; fullScreen covers pages without the shell (login etc.).
export default function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
        {/* Not a dashboard-shaped skeleton: this also shows before login and sign-up pages. */}
        <Sparkles aria-label="Loading" className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }
  return <SkeletonLoader variant="card" count={4} />;
}
