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
const DEFAULT_CLASSES = [
  { course: "BSIT", yearLevel: 3, block: "A" },
  { course: "BSIT", yearLevel: 3, block: "B" },
  { course: "BSCS", yearLevel: 2, block: "A" },
];
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const classLabel = ({ course, yearLevel, block }) =>
  `${course} ${yearLevel}${block}`;
const belongsToClass = (student, course, yearLevel, block) =>
  student.course === course && String(student.yearLevel) === String(yearLevel) && student.block === block;
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
    emailedRecords = useRef(new Set()),
    selectedClass = useRef({ course: "BSIT", yearLevel: "3", block: "A" });
  const lastCloudValue = useRef("");
  const [stage, setStage] = useState("Requesting camera permission"),
    [error, setError] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [ready, setReady] = useState(false);
  const [students, setStudents] = useState(() => read("attendance-students")),
    [records, setRecords] = useState(() => read("attendance-records")),
    [classes, setClasses] = useState(() => read("attendance-classes"));
  const [date, setDate] = useState(today),
    [course, setCourse] = useState("BSIT"),
    [yearLevel, setYearLevel] = useState("3"),
    [block, setBlock] = useState("A"),
    [message, setMessage] = useState("Preparing scanner…"),
    [faces, setFaces] = useState(0),
    [match, setMatch] = useState(null);
  const [form, setForm] = useState({ name: "", studentId: "", email: "", course: "BSIT", yearLevel: "3", block: "A" }),
    [file, setFile] = useState(null),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("scan"),
    [newClass, setNewClass] = useState({ course: "", yearLevel: "1", block: "A" }),
    [historyDraft, setHistoryDraft] = useState({ studentId: "", date: today(), time: "", section: "" }),
    [historySearch, setHistorySearch] = useState(""),
    [historySectionFilter, setHistorySectionFilter] = useState(""),
    [historySort, setHistorySort] = useState("newest"),
    [enrolling, setEnrolling] = useState(false),
    [isEnrollmentOpen, setEnrollmentOpen] = useState(false);
  const [editingId, setEditingId] = useState(null),
    [historyEditingId, setHistoryEditingId] = useState(null),
    [editForm, setEditForm] = useState({ name: "", studentId: "", email: "", course: "BSIT", yearLevel: "3", block: "A" }),
    [editFile, setEditFile] = useState(null),
    [savingEdit, setSavingEdit] = useState(false);
  const [theme, setTheme] = useState(getTheme),
    [online, setOnline] = useState(true),
    [connection, setConnection] = useState("standby"),
    [notifications, setNotifications] = useState([]),
    [systemAlert, setSystemAlert] = useState(""),
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
  const section = classLabel({ course, yearLevel, block });
  const activeClasses = classes.length ? classes : DEFAULT_CLASSES;
  const courses = [...new Set(activeClasses.map((item) => item.course))];
  const yearsForCourse = [...new Set(activeClasses.filter((item) => item.course === course).map((item) => String(item.yearLevel)))];
  const blocksForClass = [...new Set(activeClasses.filter((item) => item.course === course && String(item.yearLevel) === String(yearLevel)).map((item) => item.block))];
  const chooseClass = (value, change) => {
    const [nextCourse, nextYear, nextBlock] = value.split("|");
    change({ course: nextCourse, yearLevel: nextYear, block: nextBlock });
  };
  const showError = useCallback((cause, fallback) => {
    setSystemAlert(cause?.message || cause || fallback);
  }, []);

  useEffect(() => {
    store("attendance-students", students);
    roster.current = students
      .filter((s) => s.descriptor)
      .map((s) => ({ ...s, vector: new Float32Array(s.descriptor) }));
  }, [students]);
  useEffect(() => {
    selectedClass.current = { course, yearLevel, block };
  }, [block, course, yearLevel]);
  useEffect(() => {
    store("attendance-records", records);
  }, [records]);
  useEffect(() => {
    store("attendance-classes", classes);
  }, [classes]);
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
          classes: Array.isArray(value.classes) && value.classes.length ? value.classes : DEFAULT_CLASSES,
        };
        // On a new database, keep local records long enough to migrate them once.
        const initial = next.students.length || next.records.length
          ? next
          : { students: read("attendance-students"), records: read("attendance-records"), classes: read("attendance-classes") };
        lastCloudValue.current = JSON.stringify(next);
        setStudents(initial.students);
        setRecords(initial.records);
        setClasses(initial.classes?.length ? initial.classes : DEFAULT_CLASSES);
        setCloudLoaded(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = cause.message || "Could not load the MySQL attendance store.";
        setAccessError(message);
        showError(message);
      });
    return () => { cancelled = true; };
  }, [access, showError]);
  useEffect(() => {
    if (!cloudLoaded || access !== "granted") return;
    const next = { students, records, classes: activeClasses },
      serialized = JSON.stringify(next);
    if (serialized === lastCloudValue.current) return;
    lastCloudValue.current = serialized;
    saveAttendanceStore(next).catch((cause) => {
      const message = cause.message || "Could not save changes to the MySQL attendance store.";
      setAccessError(message);
      showError(message);
    });
  }, [access, activeClasses, cloudLoaded, records, showError, students]);
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
          const activeClass = selectedClass.current;
          roster.current
            .filter((student) => belongsToClass(student, activeClass.course, activeClass.yearLevel, activeClass.block))
            .forEach((student) => {
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
      const message =
        cause.message?.includes("timed") || cause.message?.includes("model")
          ? cause.message
          : cameraErrorMessage(cause);
      setError(message);
      showError(message);
    }
  }, [loop, showError, stop]);
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
      // Enrollment uses an uploaded portrait, so it must not be blocked when
      // the webcam is loading, unavailable, or permission was denied.
      await loadDetector();
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
      const nextId = form.studentId.trim();
      const nextName = form.name.trim();
      const nextEmail = form.email.trim();
      if (!nextName || !nextId) throw new Error("Full name and student ID are required.");
      if (students.some((s) => normalize(s.studentId) === normalize(nextId)))
        throw new Error("That student ID is already enrolled.");
      if (students.some((s) => normalize(s.name) === normalize(nextName)))
        throw new Error("A student with that full name is already enrolled.");
      if (nextEmail && students.some((s) => s.email && normalize(s.email) === normalize(nextEmail)))
        throw new Error("That email address is already enrolled.");
      const photo = await toDataUrl(file);
      setStudents((all) => [
        ...all,
        {
          ...form,
          name: nextName,
          studentId: nextId,
          email: nextEmail,
          yearLevel: String(form.yearLevel),
          block: form.block.trim().toUpperCase(),
          descriptor: Array.from(result[0].descriptor),
          photo,
        },
      ]);
      setForm({ name: "", studentId: "", email: "", course, yearLevel, block });
      setNotice("Student enrolled.");
      setEnrollmentOpen(false);
    } catch (cause) {
      const message = cause.message || "Could not enroll student.";
      setNotice(message);
      showError(message);
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
      course: student.course || "BSIT",
      yearLevel: String(student.yearLevel || "1"),
      block: student.block || "A",
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
      const nextName = editForm.name.trim();
      const nextEmail = editForm.email.trim();
      if (!nextName || !nextId) throw new Error("Full name and student ID are required.");
      if (
        students.some(
          (student) =>
            normalize(student.studentId) === normalize(nextId) &&
            student.studentId !== editingId,
        )
      )
        throw new Error("That student ID is already enrolled.");
      if (students.some((student) => normalize(student.name) === normalize(nextName) && student.studentId !== editingId))
        throw new Error("A student with that full name is already enrolled.");
      if (nextEmail && students.some((student) => student.email && normalize(student.email) === normalize(nextEmail) && student.studentId !== editingId))
        throw new Error("That email address is already enrolled.");
      let changes = {
        name: nextName,
        studentId: nextId,
        email: nextEmail,
        course: editForm.course,
        yearLevel: String(editForm.yearLevel),
        block: editForm.block.trim().toUpperCase(),
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
      setRecords((all) =>
        all.map((record) => record.studentId === editingId
          ? { ...record, studentId: nextId, name: nextName }
          : record),
      );
      setEditingId(null);
      setNotice("Student information updated.");
    } catch (cause) {
      const message = cause.message || "Could not update student.";
      setNotice(message);
      showError(message);
    } finally {
      setSavingEdit(false);
    }
  };
  const deleteStudent = (student) => {
    if (!window.confirm(`Delete ${student.name} and their attendance records? This cannot be undone.`)) return;
    setStudents((all) => all.filter((item) => item.studentId !== student.studentId));
    setRecords((all) => all.filter((record) => record.studentId !== student.studentId));
    setNotice(`${student.name} was deleted.`);
  };
  const addClass = (event) => {
    event.preventDefault();
    const next = {
      course: newClass.course.trim().toUpperCase(),
      yearLevel: String(newClass.yearLevel).trim(),
      block: newClass.block.trim().toUpperCase(),
    };
    if (!next.course || !next.yearLevel || !next.block)
      return setNotice("Course, year level, and block are required.");
    if (!/^\d+$/.test(next.yearLevel) || Number(next.yearLevel) < 1 || Number(next.yearLevel) > 8)
      return setNotice("Year level must be a number from 1 to 8.");
    if (activeClasses.some((item) => classLabel(item).toLowerCase() === classLabel(next).toLowerCase()))
      return setNotice("That class already exists.");
    setClasses([...activeClasses, next]);
    setNewClass({ course: "", yearLevel: "1", block: "A" });
    setNotice(`${classLabel(next)} was added.`);
  };
  const deleteClass = (item) => {
    const assigned = students.filter((student) => belongsToClass(student, item.course, item.yearLevel, item.block));
    if (assigned.length)
      return setNotice(`Move or delete the ${assigned.length} student(s) assigned to ${classLabel(item)} before deleting it.`);
    if (!window.confirm(`Delete ${classLabel(item)}?`)) return;
    const remaining = activeClasses.filter((candidate) => classLabel(candidate) !== classLabel(item));
    setClasses(remaining);
    if (classLabel({ course, yearLevel, block }) === classLabel(item)) {
      const fallback = remaining[0];
      if (fallback) {
        setCourse(fallback.course);
        setYearLevel(String(fallback.yearLevel));
        setBlock(fallback.block);
      }
    }
    setNotice(`${classLabel(item)} was deleted.`);
  };
  const saveHistoryRecord = (event) => {
    event.preventDefault();
    const student = students.find((item) => item.studentId === historyDraft.studentId);
    const next = {
      studentId: historyDraft.studentId,
      name: student?.name || "",
      date: historyDraft.date,
      time: historyDraft.time.trim(),
      section: historyDraft.section.trim(),
    };
    if (!next.studentId || !next.date || !next.time || !next.section)
      return setNotice("Choose a student, date, time, and section.");
    if (records.some((item) => item.studentId === next.studentId && item.date === next.date && item.section === next.section && item.id !== historyEditingId))
      return setNotice("This student already has attendance for that class and date.");
    if (historyEditingId) {
      setRecords((all) => all.map((item) => item.id === historyEditingId ? { ...item, ...next } : item));
      setNotice("Attendance record updated.");
    } else {
      setRecords((all) => [...all, { id: crypto.randomUUID(), ...next }]);
      setNotice("Attendance record added.");
    }
    setHistoryEditingId(null);
    setHistoryDraft({ studentId: "", date: today(), time: "", section: section });
  };
  const editHistoryRecord = (record) => {
    setHistoryEditingId(record.id);
    setHistoryDraft({ studentId: record.studentId, date: record.date, time: record.time, section: record.section });
    setNotice("");
  };
  const deleteHistoryRecord = (record) => {
    if (!window.confirm(`Delete the attendance record for ${record.name}?`)) return;
    setRecords((all) => all.filter((item) => item.id !== record.id));
    setNotice("Attendance record deleted.");
  };
  const deleteAllHistory = () => {
    if (!records.length) return;
    if (!window.confirm(`Delete all ${records.length} attendance record(s)? This cannot be undone.`)) return;
    setRecords([]);
    setHistoryEditingId(null);
    setNotice("All attendance records were deleted. Student and class data were kept.");
  };
  const historySections = useMemo(
    () => [...new Set(records.map((record) => record.section).filter(Boolean))].sort(),
    [records],
  );
  const displayedHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const next = records.filter((record) =>
      (!query || `${record.name} ${record.studentId} ${record.section}`.toLowerCase().includes(query)) &&
      (!historySectionFilter || record.section === historySectionFilter),
    );
    return next.sort((left, right) => {
      if (historySort === "oldest") return `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`);
      if (historySort === "name") return left.name.localeCompare(right.name);
      if (historySort === "class") return left.section.localeCompare(right.section) || left.name.localeCompare(right.name);
      return `${right.date}${right.time}`.localeCompare(`${left.date}${left.time}`);
    });
  }, [historySearch, historySectionFilter, historySort, records]);
  const attendance = useMemo(
    () => records.filter((r) => r.date === date && r.section === section),
    [date, records, section],
  );
  const studentsForClass = useMemo(
    () => students.filter((student) => belongsToClass(student, course, yearLevel, block)),
    [block, course, students, yearLevel],
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
      {systemAlert && (
        <aside className="system-alert" role="alert" aria-live="assertive">
          <div><b>Something went wrong</b><span>{systemAlert}</span></div>
          <button type="button" aria-label="Dismiss error notification" onClick={() => setSystemAlert("")}>×</button>
        </aside>
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
      <nav className="workspace-nav" aria-label="Attendance workspace">
        {[
          ["scan", "Scanner"],
          ["students", "Students"],
          ["history", "History"],
          ["classes", "Classes"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={page === key ? "active" : ""}
            aria-current={page === key ? "page" : undefined}
            onClick={() => { setPage(key); setNotice(""); }}
          >
            {label}
          </button>
        ))}
      </nav>
      <section hidden={page !== "scan"} aria-label="Scanner workspace">
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
            Course
            <select
              disabled={!ready}
              value={course}
              onChange={(e) => {
                const next = activeClasses.find((item) => item.course === e.target.value);
                if (next) { setCourse(next.course); setYearLevel(String(next.yearLevel)); setBlock(next.block); }
              }}
            >
              {courses.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Year
            <select disabled={!ready} value={yearLevel} onChange={(e) => {
              const next = activeClasses.find((item) => item.course === course && String(item.yearLevel) === e.target.value);
              if (next) { setYearLevel(String(next.yearLevel)); setBlock(next.block); }
            }}>
              {yearsForCourse.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Block
            <select disabled={!ready} value={block} onChange={(e) => setBlock(e.target.value)}>
              {blocksForClass.map((item) => <option key={item}>{item}</option>)}
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
              <b>{studentsForClass.length}</b> enrolled in {section}
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
      </section>
      {page === "students" && <>
      <section className="page-heading page-heading-compact">
        <div>
          <p className="eyebrow">STUDENT DIRECTORY</p>
          <h1>Students</h1>
          <p className="muted">Enroll and maintain the face-recognition roster.</p>
        </div>
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
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Student ID
            <input
              required
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Class assignment
            <select required value={`${form.course}|${form.yearLevel}|${form.block}`} onChange={(e) => chooseClass(e.target.value, (next) => setForm({ ...form, ...next }))}>
              {activeClasses.map((item) => <option key={classLabel(item)} value={`${item.course}|${item.yearLevel}|${item.block}`}>{classLabel(item)}</option>)}
            </select>
          </label>
          <label>
            Reference portrait
            <input
              required
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
              </div>
              <footer className="student-modal-actions">
                <button className="modal-cancel" type="button" disabled={enrolling} onClick={() => setEnrollmentOpen(false)}>Cancel</button>
          <button className="enroll-button" disabled={enrolling}>
            {enrolling ? "Verifying…" : "Enroll student"}
          </button>
              </footer>
            </form>
          </div>
        )}
        {notice && <p className="enroll-message">{notice}</p>}
        <div className="directory-list">
          {studentsForClass.map((student) => (
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
                <small>{classLabel(student)}</small>
              </span>
              <button
                className="edit-student"
                onClick={() => beginEdit(student)}
              >
                Edit
              </button>
              <button
                className="delete-student"
                type="button"
                onClick={() => deleteStudent(student)}
              >
                Delete
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
                Class assignment
                <select required value={`${editForm.course}|${editForm.yearLevel}|${editForm.block}`} onChange={(e) => chooseClass(e.target.value, (next) => setEditForm({ ...editForm, ...next }))}>
                  {activeClasses.map((item) => <option key={classLabel(item)} value={`${item.course}|${item.yearLevel}|${item.block}`}>{classLabel(item)}</option>)}
                </select>
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
      </>}
      {page === "history" && <section className="workspace-page">
        <div className="page-heading page-heading-compact">
          <div>
            <p className="eyebrow">ATTENDANCE LOG</p>
            <h1>Attendance history</h1>
            <p className="muted">Add, correct, or remove saved attendance records.</p>
          </div>
        </div>
        <div className="history-layout">
          <form className="management-card history-form" onSubmit={saveHistoryRecord}>
            <div className="section-title"><div><p className="eyebrow">{historyEditingId ? "EDIT RECORD" : "NEW RECORD"}</p><h2>{historyEditingId ? "Update attendance" : "Add attendance"}</h2></div></div>
            <label>Student
              <select value={historyDraft.studentId} onChange={(event) => setHistoryDraft({ ...historyDraft, studentId: event.target.value })} required>
                <option value="">Select student</option>
                {students.map((student) => <option key={student.studentId} value={student.studentId}>{student.name} — {student.studentId}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={historyDraft.date} onChange={(event) => setHistoryDraft({ ...historyDraft, date: event.target.value })} required /></label>
            <label>Time<input type="time" value={historyDraft.time} onChange={(event) => setHistoryDraft({ ...historyDraft, time: event.target.value })} required /></label>
            <label>Class / section
              <select value={historyDraft.section} onChange={(event) => setHistoryDraft({ ...historyDraft, section: event.target.value })} required>
                <option value="">Select class</option>
                {activeClasses.map((item) => <option key={classLabel(item)} value={classLabel(item)}>{classLabel(item)}</option>)}
              </select>
            </label>
            <div className="form-actions"><button>{historyEditingId ? "Save record" : "Add record"}</button>{historyEditingId && <button type="button" className="secondary-button" onClick={() => { setHistoryEditingId(null); setHistoryDraft({ studentId: "", date: today(), time: "", section }); }}>Cancel</button>}</div>
          </form>
          <section className="management-card history-table-card">
            <div className="section-title"><div><p className="eyebrow">SAVED RECORDS</p><h2>{displayedHistory.length} of {records.length} attendance entries</h2></div><button type="button" className="danger-button" disabled={!records.length} onClick={deleteAllHistory}>Delete all</button></div>
            <div className="history-controls">
              <label>Search
                <input type="search" placeholder="Name, ID, or class" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} />
              </label>
              <label>Class
                <select value={historySectionFilter} onChange={(event) => setHistorySectionFilter(event.target.value)}><option value="">All classes</option>{historySections.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              </label>
              <label>Sort by
                <select value={historySort} onChange={(event) => setHistorySort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Student name</option><option value="class">Class / section</option></select>
              </label>
              {(historySearch || historySectionFilter || historySort !== "newest") && <button type="button" className="secondary-button clear-history-filters" onClick={() => { setHistorySearch(""); setHistorySectionFilter(""); setHistorySort("newest"); }}>Clear filters</button>}
            </div>
            <div className="history-table-wrap"><table><thead><tr><th>Student</th><th>Date</th><th>Class</th><th>Time</th><th>Actions</th></tr></thead><tbody>
              {displayedHistory.map((record) => <tr key={record.id}><td><b>{record.name}</b><small>{record.studentId}</small></td><td>{record.date}</td><td>{record.section}</td><td>{record.time}</td><td className="row-actions"><button type="button" className="secondary-button" onClick={() => editHistoryRecord(record)}>Edit</button><button type="button" className="danger-button" onClick={() => deleteHistoryRecord(record)}>Delete</button></td></tr>)}
              {!records.length && <tr><td colSpan="5" className="empty">No attendance records yet.</td></tr>}
              {!!records.length && !displayedHistory.length && <tr><td colSpan="5" className="empty">No records match your search or class filter.</td></tr>}
            </tbody></table></div>
          </section>
        </div>
      </section>}
      {page === "classes" && <section className="workspace-page">
        <div className="page-heading page-heading-compact"><div><p className="eyebrow">CLASS MANAGEMENT</p><h1>Classes</h1><p className="muted">Create the course, year level, and block combinations used throughout the system.</p></div></div>
        <div className="history-layout">
          <form className="management-card history-form" onSubmit={addClass}>
            <div className="section-title"><div><p className="eyebrow">NEW CLASS</p><h2>Add a block/year</h2></div></div>
            <label>Course<input placeholder="e.g. BSIT" value={newClass.course} onChange={(event) => setNewClass({ ...newClass, course: event.target.value })} required /></label>
            <label>Year level<input type="number" min="1" max="8" value={newClass.yearLevel} onChange={(event) => setNewClass({ ...newClass, yearLevel: event.target.value })} required /></label>
            <label>Block<input placeholder="e.g. A" maxLength="12" value={newClass.block} onChange={(event) => setNewClass({ ...newClass, block: event.target.value })} required /></label>
            <div className="form-actions"><button>Add class</button></div>
          </form>
          <section className="management-card">
            <div className="section-title"><div><p className="eyebrow">AVAILABLE CLASSES</p><h2>{activeClasses.length} class groups</h2></div></div>
            <div className="class-list">{activeClasses.map((item) => { const count = students.filter((student) => belongsToClass(student, item.course, item.yearLevel, item.block)).length; return <article className="class-row" key={classLabel(item)}><div><b>{classLabel(item)}</b><small>{count} enrolled student{count === 1 ? "" : "s"}</small></div><button type="button" className="danger-button" onClick={() => deleteClass(item)}>Delete</button></article>; })}</div>
          </section>
        </div>
      </section>}
      {notice && page !== "students" && <p className="workspace-notice">{notice}</p>}
      {notifications.map((item) => (
        <aside className="notification" key={item.id}>
          {item.message || "New server notification"}
        </aside>
      ))}
    </main>
  );
}
