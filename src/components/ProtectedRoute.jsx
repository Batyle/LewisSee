import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="grid min-h-screen place-items-center text-slate-600">Checking access…</div>;
  if (!user || !isAdmin) return <Navigate to="/" replace state={{ from: location, openLogin: true }} />;
  return <Outlet />;
}
