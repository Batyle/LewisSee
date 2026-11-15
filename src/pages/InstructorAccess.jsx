import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import AccessShell from "../components/AccessShell";
import LewisSeeLogo from "../components/LewisSeeLogo";
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

function AccessFieldIcon({ type }) {
  return type === "mail" ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </svg>
  );
}

function SubmitArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function PasswordVisibilityButton({ visible, onClick, fieldName }) {
  return (
    <button
      type="button"
      className="access-password-toggle"
      aria-label={`${visible ? "Hide" : "Show"} ${fieldName}`}
      aria-pressed={visible}
      onClick={onClick}
    >
      {visible ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.4 0 9 5 9 7a8.6 8.6 0 0 1-2.2 3.2M6.2 6.2C3.9 7.7 3 10.2 3 12c0 2 3.6 7 9 7 1.1 0 2.2-.2 3.1-.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12s3.2-7 9-7 9 7 9 7-3.2 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )}
    </button>
  );
}

function clearInstructorSession() {
  localStorage.removeItem("instructor-token");
  localStorage.removeItem("instructor-account");
}

async function signInInstructor(email, password) {
  let response;
  try {
    response = await fetch(getInstructorApiUrl("/instructor-auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Could not reach the instructor API. Check the deployment and its API service configuration.");
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
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [blocks, setBlocks] = useState([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (mode !== "register") return;
    let cancelled = false;
    fetch(getInstructorApiUrl("/blocks"))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(apiErrorMessage(data, `Could not load courses and blocks (HTTP ${response.status}).`));
        }
        if (!Array.isArray(data.blocks)) {
          throw new Error("The API returned an invalid courses and blocks list.");
        }
        return data.blocks;
      })
      .then((availableBlocks) => {
        if (!cancelled) {
          setBlocks(availableBlocks);
          setBlocksError(availableBlocks.length ? "" : "No courses or blocks were found in the live database.");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setBlocks([]);
          setBlocksError(cause.message || "Unable to load courses and blocks.");
        }
      })
      .finally(() => {
        if (!cancelled) setBlocksLoading(false);
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
  const openRegistration = () => {
    setBlocks([]);
    setBlocksLoading(true);
    setBlocksError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setMode("register");
  };

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
          throw new Error("Could not reach the instructor API. Check the deployment and its API service configuration.");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(data, "Unable to submit your request."));
        setMessage(data.message || "Request submitted — you'll be notified once an admin reviews it.");
        setForm(initialForm);
        setShowPassword(false);
        setShowConfirmPassword(false);
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
            <LewisSeeLogo className="brand-mark" />
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
          <button type="button" onClick={openRegistration} className="choice">
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
          <LewisSeeLogo className="brand-mark" />
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

      <form onSubmit={submit} className={`access-form access-form-${mode}`}>
        {mode === "register" && (
          <label>
            Full name
            <input className="field" name="name" value={form.name} onChange={update} required />
          </label>
        )}

        <label>
          {mode === "login" ? "Username or email" : "Email"}
          <span className="access-input-wrap">
            <AccessFieldIcon type="mail" />
            <input
              className="field"
              type={mode === "login" ? "text" : "email"}
              name="email"
              value={form.email}
              onChange={update}
              placeholder={mode === "login" ? "Enter your username or email" : "you@lewis.edu"}
              required
              autoComplete="username"
            />
          </span>
        </label>

        <label>
          Password
          <span className={`access-input-wrap${mode === "register" ? " access-password-field" : ""}`}>
            <AccessFieldIcon type="lock" />
            <input
              className="field"
              type={mode === "register" && showPassword ? "text" : "password"}
              name="password"
              minLength={mode === "register" ? 8 : undefined}
              value={form.password}
              onChange={update}
              placeholder="Enter your password"
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            {mode === "register" && (
              <PasswordVisibilityButton
                visible={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                fieldName="password"
              />
            )}
          </span>
        </label>

        {mode === "register" && (
          <>
            <label>
              Confirm password
              <span className="access-input-wrap access-password-field">
                <AccessFieldIcon type="lock" />
                <input
                  className="field"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  minLength="8"
                  value={form.confirmPassword}
                  onChange={update}
                  required
                  autoComplete="new-password"
                />
                <PasswordVisibilityButton
                  visible={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  fieldName="confirmation password"
                />
              </span>
            </label>
            <label>
              Courses and requested blocks
              <select
                multiple
                className="field field-select"
                value={form.requestedBlockIds.map(String)}
                disabled={blocksLoading || blocks.length === 0}
                onChange={(event) =>
                  setForm({
                    ...form,
                    requestedBlockIds: [...event.target.selectedOptions].map((option) => Number(option.value)),
                  })
                }
              >
                {blocks.length === 0 && (
                  <option value="" disabled>
                    {blocksLoading ? "Loading courses and blocks…" : "Courses and blocks unavailable"}
                  </option>
                )}
                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.course || block.name} — Year {block.yearLevel || "?"}, Block {block.block || "?"}
                  </option>
                ))}
              </select>
              {blocksError && <small className="alert error-alert" role="alert">{blocksError}</small>}
              {!blocksError && blocks.length > 0 && <small>Select one or more course blocks.</small>}
            </label>
          </>
        )}

        {error && <p className="alert error-alert">{error}</p>}
        {message && <p className="alert success-alert">{message}</p>}

        <button type="submit" disabled={busy || authLoading || (mode === "register" && blocksLoading)} className="primary-action">
          {busy ? "Please wait…" : mode === "register" ? "Submit request" : "Sign in"}
          {!busy && <SubmitArrow />}
        </button>

        {mode === "login" && (
          <p className="access-note">
            Test accounts: admin / admin123 · employee / employee123
          </p>
        )}
      </form>
      <p className="access-switch">
        {mode === "login" ? "Need instructor access?" : "Already have an account?"}
        <button
          type="button"
          onClick={() => {
            setError("");
            setMessage("");
            if (mode === "login") {
              openRegistration();
            } else {
              setMode("login");
            }
          }}
        >
          {mode === "login" ? "Request access" : "Sign in"}
        </button>
      </p>
    </AccessShell>
  );
}
