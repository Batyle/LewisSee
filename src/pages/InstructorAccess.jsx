import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import AccessShell from "../components/AccessShell";
import { clearAdminSession } from "../api/adminApi";
import { getInstructorApiUrl } from "../api/apiRoot";
import { useAuth } from "../context/AuthContext";

const apiErrorMessage = (data, fallback) => {
  if (!data || typeof data !== "object") return fallback;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  if (data.reason) return `${data.message || fallback} ${data.reason}`.trim();
  return fallback;
};

const initialForm = { name: "", email: "", password: "", confirmPassword: "", requestedBlockIds: [] };

function clearInstructorSession() {
  localStorage.removeItem("instructor-token");
  localStorage.removeItem("instructor-account");
}

async function signInInstructor(email, password) {
  if (email === "employee" && password === "employee123") {
    return { token: "local-test-instructor", instructor: { name: "Employee", email: "employee" } };
  }

  let response;
  try {
    response = await fetch(getInstructorApiUrl("/instructor-auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Failed to reach the instructor API. Start liveness-server (port 8000) and configure VITE_ADMIN_API_URL or VITE_LIVENESS_API_URL.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, "Invalid email or password."));
  }
  return data;
}

export default function InstructorAccess() {
  const { login: adminLogin, logout: adminLogout, user, isAdmin, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => (location.state?.openLogin ? "login" : "choose"));
  const [form, setForm] = useState(initialForm);
  const [blocks, setBlocks] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.state?.openLogin) setMode("login");
  }, [location.state]);

  useEffect(() => {
    if (mode !== "register") return;
    let cancelled = false;
    fetch(getInstructorApiUrl("/blocks"))
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setBlocks(data.blocks || []);
      })
      .catch(() => {
        if (!cancelled) setError("Available blocks could not be loaded. You can still submit; an admin can assign blocks later.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!authLoading && user && isAdmin) {
    return <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />;
  }

  if (!authLoading && localStorage.getItem("instructor-token") && mode !== "register") {
    return <Navigate to="/attendance" replace />;
  }

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (mode === "register" && form.password !== form.confirmPassword) {
      return setError("Passwords do not match.");
    }

    setBusy(true);
    const email = form.email.trim();
    const password = form.password;

    try {
      if (mode === "register") {
        let response;
        try {
          response = await fetch(getInstructorApiUrl("/instructor-auth/register"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name,
              email,
              password,
              requestedBlockIds: form.requestedBlockIds,
            }),
          });
        } catch {
          throw new Error("Failed to reach the instructor API. Start liveness-server (port 8000) and configure VITE_ADMIN_API_URL or VITE_LIVENESS_API_URL.");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(data, "Unable to submit your request."));
        setMessage(data.message || "Request submitted — you'll be notified once an admin reviews it.");
        setForm(initialForm);
        return;
      }

      // Unified sign-in: detect admin vs instructor from the same credentials.
      try {
        await adminLogin(email, password);
        clearInstructorSession();
        navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
        return;
      } catch {
        clearAdminSession();
        adminLogout();
      }

      try {
        const data = await signInInstructor(email, password);
        clearAdminSession();
        adminLogout();
        localStorage.setItem("instructor-token", data.token);
        localStorage.setItem("instructor-account", JSON.stringify(data.instructor));
        navigate("/attendance", { replace: true });
      } catch (instructorError) {
        throw new Error(instructorError.message || "Invalid email or password.");
      }
    } catch (cause) {
      setError(cause.message || "Unable to continue.");
    } finally {
      setBusy(false);
    }
  };

  const heroCopy =
    mode === "register"
      ? "New instructor requests are reviewed before attendance tools unlock."
      : mode === "login"
        ? "One sign-in for administrators and instructors — the system routes you by account."
        : "Open a live attendance session, or manage the campus dashboard with the same sign-in.";

  if (mode === "choose") {
    return (
      <AccessShell copy={heroCopy}>
        <div className="access-panel-top">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">LS</span>
            LewisSee
          </Link>
        </div>

        <header className="access-header">
          <p className="access-role">LewisSee</p>
          <h1>Continue to attendance</h1>
          <p className="access-lead">Sign in with your account, or request instructor access if you are new.</p>
        </header>

        <div className="access-choices">
          <button type="button" onClick={() => setMode("login")} className="choice">
            <span className="choice-icon" aria-hidden="true">→</span>
            <span className="choice-copy">
              <b>I already have an account</b>
              <small>Admin or instructor — we detect which</small>
            </span>
          </button>
          <button type="button" onClick={() => setMode("register")} className="choice">
            <span className="choice-icon" aria-hidden="true">+</span>
            <span className="choice-copy">
              <b>I need access</b>
              <small>Request an instructor account</small>
            </span>
          </button>
        </div>
      </AccessShell>
    );
  }

  return (
    <AccessShell copy={heroCopy}>
      <div className="access-panel-top">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">LS</span>
          LewisSee
        </Link>
        <button
          type="button"
          className="back"
          onClick={() => {
            setMode("choose");
            setError("");
            setMessage("");
          }}
        >
          ← Back
        </button>
      </div>

      <header className="access-header">
        <p className="access-role">{mode === "register" ? "Instructor" : "Sign in"}</p>
        <h1>{mode === "register" ? "Request access" : "Welcome back"}</h1>
        <p className="access-lead">
          {mode === "register"
            ? "Tell us who you are and which blocks you need. An admin will review it."
            : "Enter your credentials. Administrators open the dashboard; instructors open attendance."}
        </p>
      </header>

      <form onSubmit={submit} className="access-form">
        {mode === "register" && (
          <label>
            Full name
            <input className="field" name="name" value={form.name} onChange={update} required />
          </label>
        )}

        <label>
          {mode === "login" ? "Username or email" : "Email"}
          <input
            className="field"
            type={mode === "login" ? "text" : "email"}
            name="email"
            value={form.email}
            onChange={update}
            required
            autoComplete="username"
          />
        </label>

        <label>
          Password
          <input
            className="field"
            type="password"
            name="password"
            minLength={mode === "register" ? 8 : undefined}
            value={form.password}
            onChange={update}
            required
            autoComplete="current-password"
          />
        </label>

        {mode === "register" && (
          <>
            <label>
              Confirm password
              <input
                className="field"
                type="password"
                name="confirmPassword"
                minLength="8"
                value={form.confirmPassword}
                onChange={update}
                required
              />
            </label>
            <label>
              Requested blocks
              <select
                multiple
                className="field field-select"
                value={form.requestedBlockIds.map(String)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    requestedBlockIds: [...event.target.selectedOptions].map((option) => Number(option.value)),
                  })
                }
              >
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name} — {block.schedule}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {error && <p className="alert error-alert">{error}</p>}
        {message && <p className="alert success-alert">{message}</p>}

        <button disabled={busy || authLoading} className="primary-action">
          {busy ? "Please wait…" : mode === "register" ? "Submit request" : "Sign in"}
        </button>

        {mode === "login" && (
          <p className="access-note">
            Local test — admin: <b>admin</b> / <b>admin123</b> · instructor: <b>employee</b> / <b>employee123</b>
          </p>
        )}
      </form>
    </AccessShell>
  );
}
