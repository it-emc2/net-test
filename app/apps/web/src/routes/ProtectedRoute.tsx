import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { Wordmark } from "@/components/Wordmark";

/** Gate for authenticated areas. Optionally require the admin role. */
export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    // Preserve where the user was headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function FullScreenLoader() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Wordmark className="text-2xl animate-pulse" />
        <span className="text-sm text-muted-foreground">Wird geladen …</span>
      </div>
    </div>
  );
}
