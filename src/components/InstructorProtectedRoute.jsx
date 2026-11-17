import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { validateInstructorSession } from "../api/instructorSession";

export default function InstructorProtectedRoute() {
  const location = useLocation();
  const token = localStorage.getItem("instructor-token");
  const [checking, setChecking] = useState(Boolean(token));
  const [invalidSession, setInvalidSession] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!token || token === "local-test-instructor") return undefined;
    let active = true;
    let checkingSession = false;

    const validate = async () => {
      if (checkingSession) return;
      checkingSession = true;
      try {
        const result = await validateInstructorSession(token);
        if (!active) return;
        if (result.status === 401 || result.status === 403) {
          localStorage.removeItem("instructor-token");
          localStorage.removeItem("instructor-account");
          setInvalidSession(true);
          return;
        }
        if (!result.ok) {
          setSessionError(result.message || "Could not verify your instructor session. Retrying…");
          return;
        }
        setSessionError("");
      } catch {
        if (active) setSessionError("Could not reach the session service. Retrying automatically…");
      } finally {
        checkingSession = false;
        if (active) setChecking(false);
      }
    };

    void validate();
    const intervalId = window.setInterval(validate, 30000);
    window.addEventListener("focus", validate);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", validate);
    };
  }, [token]);

  if (!token || token === "local-test-instructor") {
    return <Navigate to="/" replace state={{ from: location, openLogin: true }} />;
  }
  if (invalidSession) {
    return <Navigate to="/instructor" replace state={{ sessionExpired: true }} />;
  }
  if (checking) return <div className="admin-loading" role="status">Verifying instructor session…</div>;
  return (
    <>
      {sessionError && <p className="offline-banner" role="status">{sessionError}</p>}
      <Outlet />
    </>
  );
}
