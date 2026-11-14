import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import InstructorProtectedRoute from "./components/InstructorProtectedRoute";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Instructors from "./pages/Instructors";
import Notifications from "./pages/Notifications";
import InstructorAccess from "./pages/InstructorAccess";
import AttendanceHome from "./pages/AttendanceHome";
import LandingPage from "./pages/LandingPage";
import IntroAnimation from "./components/IntroAnimation";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/instructor" element={<InstructorAccess />} />
        <Route path="/login" element={<InstructorAccess />} />
        <Route element={<InstructorProtectedRoute />}>
          <Route path="/attendance" element={<AttendanceHome />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/instructors" element={<Instructors />} />
            <Route path="/notifications" element={<Notifications />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <IntroAnimation />
    </>
  );
}
