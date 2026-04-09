import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import SkeletonLoader from '@/components/SkeletonLoader';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, userSettings, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: 'var(--page-bg)' }}>
        <SkeletonLoader variant="card" count={4} />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // If onboarding not complete and not already on onboarding
  if (userSettings && !userSettings.onboarding_complete) {
    return <Navigate to="/onboarding" replace />;
  }

  // If no settings at all, go to onboarding
  if (!userSettings) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
