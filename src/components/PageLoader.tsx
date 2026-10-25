import SkeletonLoader from '@/components/SkeletonLoader';

// Shown while a page's code chunk downloads. Inside the app shell only the
// content area waits; fullScreen covers pages without the shell (login etc.).
export default function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: 'var(--page-bg)' }}>
        <SkeletonLoader variant="card" count={4} />
      </div>
    );
  }
  return <SkeletonLoader variant="card" count={4} />;
}
