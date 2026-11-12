import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import React from 'react';

export function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, assignment, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user is a Worker and has no assignment for today, force them to the assignment page
  if (user?.role === 'Worker' && !assignment && location.pathname !== '/assignment') {
    return <Navigate to="/assignment" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export function PublicRoute({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, assignment, user } = useAuthStore();

  if (isAuthenticated) {
    if (user?.role === 'Worker' && !assignment) {
      return <Navigate to="/assignment" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
