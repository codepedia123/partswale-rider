import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function AuthGate({ children }: PropsWithChildren) {
  const location = useLocation();
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
