import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function InstructorProtectedRoute() {
  const location = useLocation();
  const token = localStorage.getItem("instructor-token");
  return token && token !== "local-test-instructor"
    ? <Outlet />
    : <Navigate to="/" replace state={{ from: location, openLogin: true }} />;
}
