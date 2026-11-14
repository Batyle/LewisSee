import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LoadingScreen from "./LoadingScreen";

export default function ProtectedRoute() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen message="Checking your administrator access…" />;
  if (!user || !isAdmin) return <Navigate to="/" replace state={{ from: location, openLogin: true }} />;
  return <Outlet />;
}
