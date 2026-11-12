import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import InstructorProtectedRoute from "./components/InstructorProtectedRoute";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Instructors from "./pages/Instructors";
import Notifications from "./pages/Notifications";
import InstructorAccess from "./pages/InstructorAccess";
import AttendanceHome from "./pages/AttendanceHome";

function LegacyLoginRedirect() {
  const location = useLocation();
  return <Navigate to="/" replace state={{ ...location.state, openLogin: true }} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<InstructorAccess />} />
      <Route path="/instructor" element={<InstructorAccess />} />
      <Route element={<InstructorProtectedRoute />}>
        <Route path="/attendance" element={<AttendanceHome />} />
      </Route>
      <Route path="/login" element={<LegacyLoginRedirect />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/instructors" element={<Instructors />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
