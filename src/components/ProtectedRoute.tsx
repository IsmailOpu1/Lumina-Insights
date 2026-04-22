import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import SkeletonLoader from '@/components/SkeletonLoader';

export default function ProtectedRoute({
  children
}: {
  children: React.ReactNode
}) {
  const { session, userSettings, loading } = useAuth();

  // Still loading auth + settings
  if (loading) {
    return (
      <div
        className="flex h-screen w-screen
          items-center justify-center"
        style={{ backgroundColor: 'var(--page-bg)' }}
      >
        <SkeletonLoader variant="card" count={4} />
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no settings row yet
  // OR onboarding explicitly false
  // → go to onboarding
  // Only redirect when loading is complete (prevents race condition during loading)
  if (!loading && session && (!userSettings || userSettings.onboarding_complete === false)) {
    return <Navigate to="/onboarding" replace />;
  }

  // All good → render the page
  return <>{children}</>;
}