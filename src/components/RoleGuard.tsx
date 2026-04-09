import { useAuth, type UserRole } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';

interface Props {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: Props) {
  const { role } = useAuth();

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
