import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  cameraErrorMessage,
  createInferenceCanvas,
  drawImageCover,
  requestCamera,
  setCameraPaused,
  stopCamera,
} from "./camera";
import {
  detect,
  distance,
  INFERENCE_HEIGHT,
  INFERENCE_WIDTH,
  loadDetector,
  warmDetector,
} from "./detector";
import { NotificationConnection } from "./connection";
import { auth } from "./firebase";
import { loadAttendanceStore, saveAttendanceStore } from "./attendanceApi";
import { applyTheme, getTheme, watchSystemTheme } from "./theme";
import "./App.css";

const TIMEOUT = 20000,
  TARGET_FPS = 14,
  UI_INTERVAL = 250,
  // A webcam frame naturally differs more from an enrollment portrait than two still photos.
  // Liveness verification remains mandatory before any attendance can be recorded.
  MATCH_DISTANCE_THRESHOLD = 0.58;
// Temporary local access for demos. Set to false when Firebase staff accounts are ready.
const TEST_STAFF_ACCESS = true;
const today = () => new Date().toISOString().slice(0, 10);
const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};
const timed = (promise, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), TIMEOUT),
    ),
  ]);
const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
const verifyLiveness = async (canvas) => {
  // Loopback only works during local development. Production builds must be
  // given a public HTTPS endpoint through VITE_LIVENESS_API_URL.
  const livenessUrl = import.meta.env.VITE_LIVENESS_API_URL?.trim() ||
    (import.meta.env.DEV ? "http://127.0.0.1:8000/liveness" : "");
  if (!livenessUrl)
    throw new Error("Liveness is not configured for this deployment.");
  const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!image) throw new Error("Could not capture a frame for liveness verification.");
  const body = new FormData();
  body.append("image", image, "camera-frame.jpg");
  const response = await fetch(livenessUrl, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(`Liveness service returned ${response.status}.`);
  return response.json();
};
const sendAttendanceEmail = async (student, record) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID,
    templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  if (!student.email || !serviceId || !templateId || !publicKey) return false;
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: student.email,
        to_name: student.name,
        student_name: student.name,
        student_id: student.studentId,
        class_name: record.section,
        attendance_date: record.date,
        attendance_time: record.time,
        message: "Your attendance has been recorded.",
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Email service returned ${response.status}.`);
  return true;
};

const Loader = memo(({ stage, error, elapsed, retry }) => (
  <div className="pipeline-status" role="status">
    <div className="spinner" />
    <p className="eyebrow">CAMERA PIPELINE</p>
    <h2>{stage}</h2>
    {error ? (
      <>
        <p className="error">{error}</p>
        <button onClick={retry}>Retry</button>
      </>
    ) : (
      <>
        <div className="loading-bar">
          <i />
        </div>
        <small>{elapsed}s elapsed</small>
      </>
    )}
  </div>
));

function StaffAccess({ error, onSignIn, onSignUp }) {
  const [mode, setMode] = useState("sign-in"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [message, setMessage] = useState("");
  const isSignUp = mode === "sign-up";
  const changeMode = () => {
    setMode(isSignUp ? "sign-in" : "sign-up");
    setMessage("");
    setPassword("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (isSignUp) await onSignUp(name, email, password);
      else await onSignIn(email, password);
    } catch (cause) {
      setMessage(
        cause.message?.replace("Firebase: ", "") || "Could not continue.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="access-screen">
      <form className="access-card" onSubmit={submit}>
        <div className="access-brand">
          <span className="brand-mark">L</span>
          <span>Lewisee</span>
        </div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1>{isSignUp ? "Create your staff account" : "Welcome back"}</h1>
        <p className="access-copy">
          {isSignUp
            ? "Register to manage attendance and student enrollment."
            : "Sign in to access the attendance workspace."}
        </p>
        {isSignUp && (
          <label>
            Staff name
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label>
          Work email
          <input
            required
            type={TEST_STAFF_ACCESS ? "text" : "email"}
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={TEST_STAFF_ACCESS ? undefined : 6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {(message || error) && <p className="error">{message || error}</p>}
        <button className="auth-submit" disabled={submitting}>
          {submitting
            ? "Please wait…"
            : isSignUp
              ? "Create staff account"
              : "Sign in"}
        </button>
        <p className="auth-prompt">
          {isSignUp ? "Already registered?" : "New staff member?"}{" "}
          <button className="auth-switch" type="button" onClick={changeMode}>
            {isSignUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}

export default function App() {
  const video = useRef(),
    overlay = useRef(),
    stream = useRef(),
    frame = useRef(),
    raf = useRef(),
    running = useRef(false),
    busy = useRef(false),
    lastFrame = useRef(0),
    interval = useRef(1000 / TARGET_FPS),
    roster = useRef([]),
    lastUi = useRef(0),
    lastSignature = useRef(""),
    socket = useRef(),
    emailedRecords = useRef(new Set());
  const lastCloudValue = useRef("");
  const [stage, setStage] = useState("Requesting camera permission"),
    [error, setError] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [ready, setReady] = useState(false);
  const [students, setStudents] = useState(() => read("attendance-students")),
    [records, setRecords] = useState(() => read("attendance-records"));
  const [date, setDate] = useState(today),
    [section, setSection] = useState("BSIT 3A"),
    [message, setMessage] = useState("Preparing scanner…"),
    [faces, setFaces] = useState(0),
    [match, setMatch] = useState(null);
  const [form, setForm] = useState({ name: "", studentId: "", email: "" }),
    [file, setFile] = useState(null),
    [notice, setNotice] = useState(""),
    [enrolling, setEnrolling] = useState(false),
    [isEnrollmentOpen, setEnrollmentOpen] = useState(false);
  const [editingId, setEditingId] = useState(null),
    [editForm, setEditForm] = useState({ name: "", studentId: "", email: "" }),
    [editFile, setEditFile] = useState(null),
    [savingEdit, setSavingEdit] = useState(false);
  const [theme, setTheme] = useState(getTheme),
    [online, setOnline] = useState(true),
    [connection, setConnection] = useState("standby"),
    [notifications, setNotifications] = useState([]),
    [debug, setDebug] = useState({ fps: 0, ms: 0 });
  const [access, setAccess] = useState(
      TEST_STAFF_ACCESS
        ? "signed-out"
        : auth
          ? "checking"
          : "unconfigured",
    ),
    [accessError, setAccessError] = useState(""),
    [staffUser, setStaffUser] = useState(null),
    [cloudLoaded, setCloudLoaded] = useState(false);
  const debugMode = new URLSearchParams(location.search).get("debug") === "1";

  useEffect(() => {
    store("attendance-students", students);
    roster.current = students
      .filter((s) => s.descriptor)
      .map((s) => ({ ...s, vector: new Float32Array(s.descriptor) }));
  }, [students]);
  useEffect(() => {
    store("attendance-records", records);
  }, [records]);
  useEffect(() => {
    if (TEST_STAFF_ACCESS || !auth) return undefined;
    return onAuthStateChanged(auth, (user) => {
      setStaffUser(user);
      setCloudLoaded(false);
      setAccess(user ? "granted" : "signed-out");
    });
  }, []);
  useEffect(() => {
    if (access !== "granted") return undefined;
    let cancelled = false;
    setCloudLoaded(false);
    void loadAttendanceStore()
      .then((value) => {
        if (cancelled) return;
        const next = {
          students: Array.isArray(value.students) ? value.students : [],
          records: Array.isArray(value.records) ? value.records : [],
        };
        // On a new database, keep local records long enough to migrate them once.
        const initial = next.students.length || next.records.length
          ? next
          : { students: read("attendance-students"), records: read("attendance-records") };
        lastCloudValue.current = JSON.stringify(next);
        setStudents(initial.students);
        setRecords(initial.records);
        setCloudLoaded(true);
      })
      .catch((cause) => !cancelled && setAccessError(cause.message || "Could not load the MySQL attendance store."));
    return () => { cancelled = true; };
  }, [access]);
  useEffect(() => {
    if (!cloudLoaded || access !== "granted") return;
    const next = { students, records },
      serialized = JSON.stringify(next);
    if (serialized === lastCloudValue.current) return;
    lastCloudValue.current = serialized;
    saveAttendanceStore(next).catch((cause) =>
      setAccessError(cause.message || "Could not save changes to the MySQL attendance store."),
    );
  }, [access, cloudLoaded, records, students]);
  useEffect(() => {
    applyTheme(theme);
    return watchSystemTheme(theme, () => applyTheme("system"));
  }, [theme]);
  useEffect(() => {
    const tick = setInterval(() => !ready && setElapsed((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [ready]);
  useEffect(() => {
    const onlineHandler = () => {
        setOnline(true);
        socket.current?.connect();
      },
      offlineHandler = () => {
        setOnline(false);
        setConnection("offline");
      };
    addEventListener("online", onlineHandler);
    addEventListener("offline", offlineHandler);
    const url = import.meta.env.VITE_NOTIFICATIONS_WS_URL;
    if (url) {
      socket.current = new NotificationConnection(url, setConnection, (item) =>
        setNotifications((all) => [item, ...all].slice(0, 4)),
      );
      socket.current.connect();
    } else setConnection("standby");
    return () => {
      removeEventListener("online", onlineHandler);
      removeEventListener("offline", offlineHandler);
      socket.current?.close();
    };
  }, []);

  const stop = useCallback(() => {
    running.current = false;
    cancelAnimationFrame(raf.current);
  }, []);
  const paint = useCallback((detections, matches, livenessState = "pending") => {
    const v = video.current,
      c = overlay.current;
    if (!v?.videoWidth || !c) return;
    if (c.width !== v.videoWidth) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    const ctx = c.getContext("2d"),
      sx = c.width / frame.current.width,
      sy = c.height / frame.current.height;
    ctx.clearRect(0, 0, c.width, c.height);
    const colors = getComputedStyle(document.documentElement);
    detections.forEach((d, index) => {
      const b = d.detection.box,
        found = matches[index],
        isSpoof = livenessState === "spoof" && Boolean(found),
        x = b.x * sx,
        y = b.y * sy,
        w = b.width * sx,
        h = b.height * sy,
        label = found
          ? `${found.student.name} · ${found.score}%`
          : "Unknown face";
      ctx.strokeStyle = isSpoof
        ? colors.getPropertyValue("--danger")
        : found && livenessState === "live"
          ? colors.getPropertyValue("--good")
          : colors.getPropertyValue("--warning");
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = colors.getPropertyValue("--primary");
      const labelWidth = Math.max(130, ctx.measureText(label).width + 16);
      ctx.fillRect(x, Math.max(0, y - 27), labelWidth, 25);
      ctx.fillStyle = colors.getPropertyValue("--surface");
      ctx.font = "600 14px system-ui";
      ctx.fillText(label, x + 8, Math.max(17, y - 9));
    });
  }, []);
  const ui = useCallback((next) => {
    const now = performance.now(),
      signature = `${next.count}:${next.name || ""}:${next.message}`;
    if (
      signature === lastSignature.current &&
      now - lastUi.current < UI_INTERVAL
    )
      return;
    lastSignature.current = signature;
    lastUi.current = now;
    setFaces(next.count);
    setMatch(next.match || null);
    setMessage(next.message);
  }, []);
  const present = useCallback(
    (student) =>
      setRecords((all) => {
        if (
          all.some(
            (r) =>
              r.studentId === student.studentId &&
              r.date === date &&
              r.section === section,
          )
        )
          return all;
        const record = {
          id: crypto.randomUUID(),
          studentId: student.studentId,
          name: student.name,
          date,
          section,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        socket.current?.send({ type: "attendance", id: record.id, record });
        if (!emailedRecords.current.has(record.id)) {
          emailedRecords.current.add(record.id);
          void sendAttendanceEmail(student, record)
            .then((sent) => {
              if (sent)
                setNotifications((items) =>
                  [
                    {
                      id: `email-${record.id}`,
                      message: `Attendance email sent to ${student.name}.`,
                    },
                    ...items,
                  ].slice(0, 4),
                );
            })
            .catch(() =>
              setNotifications((items) =>
                [
                  {
                    id: `email-error-${record.id}`,
                    message: `Attendance saved, but email to ${student.name} could not be sent.`,
                  },
                  ...items,
                ].slice(0, 4),
              ),
            );
        }
        return [...all, record];
      }),
    [date, section],
  );
  const loop = useCallback(
    async (now) => {
      if (!running.current) return;
      raf.current = requestAnimationFrame(loop);
      if (
        busy.current ||
        now - lastFrame.current < interval.current ||
        video.current?.readyState < 2
      )
        return;
      busy.current = true;
      lastFrame.current = now;
      const start = performance.now();
      try {
        const context = frame.current.getContext("2d", { willReadFrequently: true });
        if (!drawImageCover(context, video.current, INFERENCE_WIDTH, INFERENCE_HEIGHT))
          return;
        const detected = await detect(frame.current);
        const matches = detected.map((face) => {
          let best,
            score = Infinity;
          roster.current.forEach((student) => {
            const value = distance(face.descriptor, student.vector);
            if (value < score) {
              score = value;
              best = student;
            }
          });
          return best && score < MATCH_DISTANCE_THRESHOLD
            ? { student: best, score: Math.round((1 - score / 0.7) * 100) }
            : null;
        });
        const found = matches.find(Boolean);
        let liveness;
        let livenessFailed = false;
        if (found) {
          try {
            liveness = await verifyLiveness(frame.current);
            if (liveness.live) present(found.student);
          } catch (livenessError) {
            console.warn("Liveness verification failed", livenessError);
            livenessFailed = true;
          }
        }
        // Show the matched student even if liveness is offline, so that an
        // unavailable liveness server cannot be mistaken for a failed match.
        // Attendance is still saved only when liveness.live is true.
        paint(
          detected,
          matches,
          liveness?.live ? "live" : liveness ? "spoof" : "unavailable",
        );
        ui({
          count: detected.length,
          match: liveness?.live ? found : null,
          name: liveness?.live ? found?.student.name : undefined,
          message: found && liveness?.live
            ? `${found.student.name} recognized and verified live.`
            : found && liveness && !liveness.live
              ? "Photo or screen detected — attendance was not recorded."
              : found && livenessFailed
                ? "Liveness service unavailable — attendance is blocked."
              : found
                ? "Face recognized. Waiting for the liveness service."
            : detected.length
              ? "Face found, but no enrolled student matched."
              : "Looking for a face…",
        });
        const spent = performance.now() - start;
        interval.current = Math.max(1000 / TARGET_FPS, spent * 1.15);
        if (debugMode)
          setDebug({
            fps: Math.round(1000 / interval.current),
            ms: Math.round(spent),
          });
      } catch (scanError) {
        console.warn("Face scan failed", scanError);
      } finally {
        busy.current = false;
      }
    },
    [debugMode, paint, present, ui],
  );
  const start = useCallback(async () => {
    stop();
    stopCamera(stream.current);
    setReady(false);
    setError("");
    setElapsed(0);
    try {
      setStage("Requesting camera permission");
      stream.current = await timed(
        requestCamera(),
        "Camera permission timed out. Check that a camera is connected.",
      );
      setStage("Loading face model");
      await timed(
        loadDetector(),
        "The face model could not download in 20 seconds. Check your internet connection.",
      );
      frame.current = createInferenceCanvas(INFERENCE_WIDTH, INFERENCE_HEIGHT);
      setStage("Warming up detector");
      await timed(
        warmDetector(frame.current),
        "Detector warm-up timed out. Close other tabs and retry.",
      );
      video.current.srcObject = stream.current;
      await video.current.play();
      setStage("Connected");
      setReady(true);
      running.current = true;
      raf.current = requestAnimationFrame(loop);
    } catch (cause) {
      stopCamera(stream.current);
      stream.current = null;
      setError(
        cause.message?.includes("timed") || cause.message?.includes("model")
          ? cause.message
          : cameraErrorMessage(cause),
      );
    }
  }, [loop, stop]);
  useEffect(() => {
    if (access !== "granted") return undefined;
    start();
    return () => {
      stop();
      stopCamera(stream.current);
    };
  }, [access, start, stop]);
  useEffect(() => {
    if (access !== "granted") return undefined;
    const change = () => {
      if (document.hidden) {
        stop();
        setCameraPaused(stream.current, true);
      } else if (ready) {
        setCameraPaused(stream.current, false);
        running.current = true;
        raf.current = requestAnimationFrame(loop);
      }
    };
    addEventListener("visibilitychange", change);
    return () => removeEventListener("visibilitychange", change);
  }, [access, loop, ready, stop]);
  const enroll = async (event) => {
    event.preventDefault();
    if (!file) return setNotice("Choose a reference portrait.");
    setEnrolling(true);
    try {
      const api = await import("face-api.js"),
        image = await api.bufferToImage(file),
        canvas = createInferenceCanvas(INFERENCE_WIDTH, INFERENCE_HEIGHT);
      drawImageCover(
        canvas.getContext("2d", { willReadFrequently: true }),
        image,
        INFERENCE_WIDTH,
        INFERENCE_HEIGHT,
      );
      const result = await detect(canvas);
      if (result.length !== 1)
        throw new Error("The portrait must contain exactly one face.");
      if (
        students.some(
          (s) =>
            s.studentId.toLowerCase() === form.studentId.trim().toLowerCase(),
        )
      )
        throw new Error("That student ID is already enrolled.");
      const photo = await toDataUrl(file);
      setStudents((all) => [
        ...all,
        {
          ...form,
          name: form.name.trim(),
          studentId: form.studentId.trim(),
          descriptor: Array.from(result[0].descriptor),
          photo,
        },
      ]);
      setForm({ name: "", studentId: "", email: "" });
      setNotice("Student enrolled.");
      setEnrollmentOpen(false);
    } catch (cause) {
      setNotice(cause.message || "Could not enroll student.");
    } finally {
      setEnrolling(false);
    }
  };
  const beginEdit = (student) => {
    setEditingId(student.studentId);
    setEditForm({
      name: student.name,
      studentId: student.studentId,
      email: student.email || "",
    });
    setEditFile(null);
    setNotice("");
  };
  const saveEdit = async (event) => {
    event.preventDefault();
    if (!students.some((student) => student.studentId === editingId)) return;
    setSavingEdit(true);
    try {
      const nextId = editForm.studentId.trim();
      if (
        students.some(
          (student) =>
            student.studentId.toLowerCase() === nextId.toLowerCase() &&
            student.studentId !== editingId,
        )
      )
        throw new Error("That student ID is already enrolled.");
      let changes = {
        name: editForm.name.trim(),
        studentId: nextId,
        email: editForm.email.trim(),
      };
      if (editFile) {
        const api = await import("face-api.js"),
          image = await api.bufferToImage(editFile),
          canvas = createInferenceCanvas(INFERENCE_WIDTH, INFERENCE_HEIGHT);
        drawImageCover(
          canvas.getContext("2d", { willReadFrequently: true }),
          image,
          INFERENCE_WIDTH,
          INFERENCE_HEIGHT,
        );
        const result = await detect(canvas);
        if (result.length !== 1)
          throw new Error("The portrait must contain exactly one face.");
        changes = {
          ...changes,
          descriptor: Array.from(result[0].descriptor),
          photo: await toDataUrl(editFile),
        };
      }
      setStudents((all) =>
        all.map((student) =>
          student.studentId === editingId
            ? { ...student, ...changes }
            : student,
        ),
      );
      setEditingId(null);
      setNotice("Student information updated.");
    } catch (cause) {
      setNotice(cause.message || "Could not update student.");
    } finally {
      setSavingEdit(false);
    }
  };
  const attendance = useMemo(
    () => records.filter((r) => r.date === date && r.section === section),
    [date, records, section],
  );
  useEffect(() => {
    if (!TEST_STAFF_ACCESS || access !== "granted") return undefined;
    const handleTestSignOut = (event) => {
      if (!event.target.closest(".sign-out")) return;
      event.preventDefault();
      event.stopPropagation();
      setStaffUser(null);
      setAccess("signed-out");
    };
    document.addEventListener("click", handleTestSignOut, true);
    return () => document.removeEventListener("click", handleTestSignOut, true);
  }, [access]);

  if (access === "checking")
    return (
      <main className="access-screen">
        <section className="access-card">
          <h1>Checking staff session…</h1>
        </section>
      </main>
    );
  const testAccess = (name, email) => {
    setStaffUser({
      displayName: name.trim() || email.trim() || "Test staff",
      email: email.trim() || "test account",
    });
    setAccess("granted");
  };
  if (access !== "granted")
    return (
      <StaffAccess
        error={
          accessError ||
          (access === "unconfigured" ? "Staff authentication is not configured." : "")
        }
        onSignIn={(email, password) =>
          TEST_STAFF_ACCESS
            ? testAccess("", email)
            : signInWithEmailAndPassword(auth, email, password)
        }
        onSignUp={async (name, email, password) =>
          TEST_STAFF_ACCESS
            ? testAccess(name, email)
            : createUserWithEmailAndPassword(auth, email, password).then(
                (credential) =>
                  updateProfile(credential.user, { displayName: name.trim() }),
              )
        }
      />
    );
  return (
    <main className="attendance-app">
      {!online && (
        <div className="offline-banner">
          Internet connection lost — notifications paused
        </div>
      )}
      <header className="topbar">
        <div>
          <span className="brand-mark small">L</span>
          <span className="brand-name">Lewisee</span>
        </div>
        <div className="header-controls">
          <span className="staff-info">
            Staff: {staffUser?.displayName || staffUser?.email}
          </span>
          <span className={`connection ${connection}`}>
            Notifications:{" "}
            {connection === "standby" ? "not configured" : connection}
          </span>
          <button className="sign-out" onClick={() => signOut(auth)}>
            Sign out
          </button>
          <select
            value={theme}
            aria-label="Color theme"
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>
      <section className="page-heading">
        <div>
          <p className="eyebrow">LIVE CLASSROOM CHECK-IN</p>
          <h1>Student attendance</h1>
          <p className="muted">
            Performance-capped face recognition for live attendance.
          </p>
        </div>
        <div className="filters">
          <label>
            Date
            <input
              type="date"
              disabled={!ready}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Class
            <select
              disabled={!ready}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option>BSIT 3A</option>
              <option>BSIT 3B</option>
              <option>BSCS 2A</option>
            </select>
          </label>
        </div>
      </section>
      <section className="attendance-grid">
        <article className="camera-card">
          <div className="section-title">
            <div>
              <p className="eyebrow">CAMERA SCANNER</p>
              <h2>Recognition desk</h2>
            </div>
            <span className={`live-pill ${ready ? "on" : ""}`}>
              {ready ? "LIVE" : "LOADING"}
            </span>
          </div>
          <div className={`camera-wrap ${ready ? "visible" : ""}`}>
            <video ref={video} muted playsInline />
            <canvas ref={overlay} />
            {!ready && (
              <Loader
                stage={stage}
                error={error}
                elapsed={elapsed}
                retry={start}
              />
            )}
            {match && (
              <div className="capture-overlay">
                <b>{match.student.name}</b>
                <span>Recognized</span>
              </div>
            )}
          </div>
          <p className="scan-status">{message}</p>
          <div className="scan-summary">
            <span>
              <b>{faces}</b> faces in frame
            </span>
            <span>
              <b>{students.length}</b> enrolled
            </span>
          </div>
          {debugMode && (
            <output className="debug-readout">
              UI target: {debug.fps} FPS · inference: {debug.ms} ms
            </output>
          )}
        </article>
        <article className="records-card">
          <div className="section-title">
            <div>
              <p className="eyebrow">{date}</p>
              <h2>Today’s attendance</h2>
            </div>
            <strong>{attendance.length} present</strong>
          </div>
          <div className="attendance-list">
            {attendance.length ? (
              attendance.map((record) => (
                <div className="record" key={record.id}>
                  <span className="avatar">{record.name[0]}</span>
                  <div>
                    <b>{record.name}</b>
                    <small>{record.studentId}</small>
                  </div>
                  <time>{record.time}</time>
                </div>
              ))
            ) : (
              <p className="empty">
                No students checked in for this class and date yet.
              </p>
            )}
          </div>
        </article>
      </section>
      <section className="enrollment-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">STUDENT DIRECTORY</p>
            <h2>Student directory</h2>
          </div>
          <button type="button" onClick={() => setEnrollmentOpen(true)}>
            Enroll student
          </button>
        </div>
        {isEnrollmentOpen && (
          <div className="student-modal-backdrop" role="presentation">
            <form className="student-modal" onSubmit={enroll}>
              <header className="student-modal-header">
                <div>
                  <p className="eyebrow">STUDENT DIRECTORY</p>
                  <h2>Enroll a student</h2>
                </div>
                <button className="modal-close" type="button" aria-label="Close enrollment form" onClick={() => setEnrollmentOpen(false)}>×</button>
              </header>
              <div className="student-modal-fields">
          <label>
            Full name
            <input
              required
              disabled={!ready}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Student ID
            <input
              required
              disabled={!ready}
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              disabled={!ready}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Reference portrait
            <input
              required
              disabled={!ready}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
              </div>
              <footer className="student-modal-actions">
                <button className="modal-cancel" type="button" disabled={enrolling} onClick={() => setEnrollmentOpen(false)}>Cancel</button>
          <button className="enroll-button" disabled={!ready || enrolling}>
            {enrolling ? "Verifying…" : "Enroll student"}
          </button>
              </footer>
            </form>
          </div>
        )}
        {notice && <p className="enroll-message">{notice}</p>}
        <div className="directory-list">
          {students.map((student) => (
            <div className="student-row" key={student.studentId}>
              <span className="directory-photo">
                {student.photo ? (
                  <img src={student.photo} alt="" />
                ) : (
                  student.name[0]
                )}
              </span>
              <span>
                <b>{student.name}</b>
                <small>{student.studentId}</small>
              </span>
              <button
                className="edit-student"
                onClick={() => beginEdit(student)}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
        {editingId && (
          <div className="student-modal-backdrop" role="presentation">
          <form className="student-modal edit-student-form" onSubmit={saveEdit}>
            <header className="student-modal-header">
              <div>
                <p className="eyebrow">EDIT STUDENT</p>
                <h2>Update student information</h2>
              </div>
              <button className="modal-close" type="button" aria-label="Close edit form" onClick={() => setEditingId(null)}>×</button>
            </header>
            <div className="student-modal-fields">
              <label>
                Full name
                <input
                  required
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                Student ID
                <input
                  required
                  value={editForm.studentId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, studentId: e.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                />
              </label>
              <label>
                Replace portrait (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                />
              </label>
              <button disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          </form>
          </div>
        )}
      </section>
      {notifications.map((item) => (
        <aside className="notification" key={item.id}>
          {item.message || "New server notification"}
        </aside>
      ))}
    </main>
  );
}
