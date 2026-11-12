import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";

const ScannerWorkspace = lazy(() => import("../ScannerWorkspace"));

export default function AttendanceHome() {
  const navigate = useNavigate();
  let instructor = { name: "Instructor" };
  try { instructor = JSON.parse(localStorage.getItem("instructor-account")) || instructor; } catch { /* keep fallback */ }
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm font-medium text-slate-500">Loading attendance workspace…</div>}><ScannerWorkspace staffUser={instructor} onSignOut={() => { localStorage.removeItem("instructor-token"); localStorage.removeItem("instructor-account"); navigate("/instructor", { replace: true }); }} /></Suspense>;
}
