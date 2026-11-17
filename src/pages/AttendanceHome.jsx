import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";
import { releaseInstructorSession } from "../api/instructorSession";

const ScannerWorkspace = lazy(() => import("../ScannerWorkspace"));

export default function AttendanceHome() {
  const navigate = useNavigate();
  let instructor = { name: "Instructor" };
  try { instructor = JSON.parse(localStorage.getItem("instructor-account")) || instructor; } catch { /* keep fallback */ }
  return <Suspense fallback={<LoadingScreen message="Loading the attendance workspace…" />}><ScannerWorkspace staffUser={instructor} onSignOut={() => { releaseInstructorSession(); localStorage.removeItem("instructor-token"); localStorage.removeItem("instructor-account"); navigate("/instructor", { replace: true }); }} /></Suspense>;
}
