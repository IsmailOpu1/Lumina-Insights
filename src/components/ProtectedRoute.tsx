import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';

export default function ProtectedRoute({
  children,
  publicHome,
}: {
  children: React.ReactNode;
  /** Shown instead of the login redirect when a signed-out visitor opens "/". */
  publicHome?: React.ReactNode;
}) {
  const { session, userSettings, loading } = useAuth();
  const location = useLocation();

  // Still loading auth + settings
  if (loading) {
    return <PageLoader fullScreen />;
  }

  // Not logged in: the landing page at "/", login everywhere else
  if (!session) {
    if (publicHome && location.pathname === '/') return <>{publicHome}</>;
    return <Navigate to="/login" replace />;
  }

  // Logged in but no settings row yet, or onboarding not finished
  if (!userSettings || userSettings.onboarding_complete === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
