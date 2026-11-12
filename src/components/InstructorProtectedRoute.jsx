import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function InstructorProtectedRoute() {
  const location = useLocation();
  return localStorage.getItem("instructor-token")
    ? <Outlet />
    : <Navigate to="/" replace state={{ from: location, openLogin: true }} />;
}
