import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";

const ScannerWorkspace = lazy(() => import("../ScannerWorkspace"));

export default function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <Suspense
      fallback={
        <div className="admin-loading" role="status">
          <span className="admin-loading-spinner" aria-hidden="true" />
          Loading attendance workspace…
        </div>
      }
    >
      <ScannerWorkspace staffUser={user} onSignOut={logout} embedded />
    </Suspense>
  );
}
