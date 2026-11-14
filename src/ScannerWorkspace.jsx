import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
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
} from "./detector";
import { NotificationConnection } from "./connection";
import { loadAttendanceStore, saveAttendanceStore } from "./attendanceApi";
import {
  determineAttendanceStatus,
  formatClock12Hour,
  isAttendancePolicyReady,
  liveAttendancePhaseAt,
  nowManilaTime,
  sessionTimeRanges,
  todayManila,
} from "./attendancePolicy";
import { applyTheme, getTheme, watchSystemTheme } from "./theme";
import LoadingScreen from "./components/LoadingScreen";
import LewisSeeLogo from "./components/LewisSeeLogo";
import SessionPolicyForm from "./components/SessionPolicyForm";
import AttendanceStatusBadge from "./components/AttendanceStatusBadge";
import "./App.css";
import "./ScannerWorkspace.css";
import "./ScannerRefinement.css";

const TIMEOUT = 20000,
  TARGET_FPS = 14,
  UI_INTERVAL = 250,
  // A webcam frame naturally differs more from an enrollment portrait than two still photos.
  // Liveness verification remains mandatory before any attendance can be recorded.
  MATCH_DISTANCE_THRESHOLD = 0.58;
const DEFAULT_CLASSES = [
  { course: "BSIT", yearLevel: 3, block: "A" },
  { course: "BSIT", yearLevel: 3, block: "B" },
  { course: "BSCS", yearLevel: 2, block: "A" },
];
const today = todayManila;
const formatDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return String(value ?? "");

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return String(value);
  }

  const monthName = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${year}-${monthName}-${day}`;
};
const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const currentStudentIdYear = () => String(new Date().getFullYear());
const studentIdFields = (studentId = "") => {
  const match = /^C-(\d{4})-(\d{3})$/.exec(studentId);
  return {
    studentIdYear: match?.[1] || currentStudentIdYear(),
    studentIdNumber: match?.[2] || "",
  };
};
const formatStudentId = ({ studentIdYear, studentIdNumber }) =>
  `C-${studentIdYear}-${studentIdNumber}`;
const isValidStudentId = ({ studentIdYear, studentIdNumber }) =>
  /^\d{4}$/.test(studentIdYear) && /^\d{3}$/.test(studentIdNumber);
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
const timed = (promise, message, timeout = TIMEOUT) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeout),
    ),
  ]);
const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
const selectPortraitFile = (file, setFile, setPreview, previewUrl) => {
  if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  previewUrl.current = file ? URL.createObjectURL(file) : "";
  setFile(file);
  setPreview(previewUrl.current);
};
const LIVE_LIVENESS_API_URL = "https://liveliness-server.vercel.app/liveness";
const isLocalUrl = (url) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());

const verifyLiveness = async (canvas) => {
  const configured = import.meta.env.VITE_LIVENESS_API_URL?.trim() || "";
  const livenessUrl = configured && !isLocalUrl(configured) ? configured : LIVE_LIVENESS_API_URL;
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
const sendAttendanceEmail = async (student, record, attendancePhoto) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim();
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim();
  const recipient = student.email?.trim();

  if (!recipient) throw new Error("This student does not have an email address.");
  if (!serviceId || !templateId || !publicKey)
    throw new Error("EmailJS is not configured for this deployment.");

  const statusStyles = {
    Present: { color: "#087957", background: "#e6fbf5" },
    Late: { color: "#9a5700", background: "#fff3d6" },
    Absent: { color: "#b42318", background: "#ffebe9" },
  }[record.status];
  if (!statusStyles) throw new Error("Attendance status is invalid; the email was not sent.");

  await emailjs.send(serviceId, templateId, {
    to_email: recipient,
    to_name: student.name,
    student_name: student.name,
    student_id: student.studentId,
    class_name: record.section,
    attendance_date: record.date,
    attendance_time: formatClock12Hour(record.time),
    attendance_status: record.status,
    status_color: statusStyles.color,
    status_background: statusStyles.background,
    message: `Your attendance was recorded as ${record.status}. A photo from the verified face scan is attached.`,
    attendance_photo: attendancePhoto,
  }, {
    publicKey,
  });
  return true;
};

const emailErrorMessage = (error) => {
  const detail = typeof error?.text === "string" ? error.text : error?.message;
  return detail ? `Email could not be sent: ${detail}` : "Email could not be sent.";
};

const Loader = memo(({ stage, error, elapsed, retry, requested, starting }) => (
  <div className="pipeline-status" aria-live="polite">
    {starting && <div className="spinner" />}
    <p className="eyebrow">CAMERA SCANNER</p>
    <h2>{stage}</h2>
    {error ? (
      <>
        <p className="error">{error}</p>
        <button type="button" onClick={retry}>Retry camera</button>
      </>
    ) : starting ? (
      <>
        <div className="loading-bar">
          <i />
        </div>
        <small>{elapsed}s elapsed</small>
      </>
    ) : (
      <>
        <p>Allow camera access to start face recognition. Your browser will ask for permission.</p>
        <button type="button" onClick={retry}>
          {requested ? "Start camera" : "Allow camera & start scanner"}
        </button>
      </>
    )}
  </div>
));

export default function ScannerWorkspace({ staffUser, onSignOut, embedded = false }) {
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
    attendanceActions = useRef(new Set()),
    selectedClass = useRef({ course: "BSIT", yearLevel: "3", block: "A" });
  const lastCloudValue = useRef("");
  const mounted = useRef(true),
    startingCamera = useRef(false);
  const [stage, setStage] = useState("Camera is off"),
    [error, setError] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [ready, setReady] = useState(false),
    [cameraConnected, setCameraConnected] = useState(false),
    [cameraRequested, setCameraRequested] = useState(false),
    [cameraStarting, setCameraStarting] = useState(false);
  const [students, setStudents] = useState(() => read("attendance-students")),
    [records, setRecords] = useState(() => read("attendance-records")),
    [classes, setClasses] = useState(() => read("attendance-classes")),
    [sessions, setSessions] = useState(() => read("attendance-sessions"));
  const [date, setDate] = useState(today),
    [course, setCourse] = useState("BSIT"),
    [yearLevel, setYearLevel] = useState("3"),
    [block, setBlock] = useState("A"),
    [message, setMessage] = useState("Preparing scanner…"),
    [faces, setFaces] = useState(0),
    [match, setMatch] = useState(null);
  const [form, setForm] = useState({ name: "", ...studentIdFields(), email: "", course: "BSIT", yearLevel: "3", block: "A" }),
    [file, setFile] = useState(null),
    [filePreview, setFilePreview] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("scan"),
    [newClass, setNewClass] = useState({ course: "", yearLevel: "1", block: "A" }),
    [historyDraft, setHistoryDraft] = useState({ studentId: "", date: today(), time: "", section: "", timeOut: "" }),
    [historySearch, setHistorySearch] = useState(""),
    [historySectionFilter, setHistorySectionFilter] = useState(""),
    [historySort, setHistorySort] = useState("newest"),
    [enrolling, setEnrolling] = useState(false),
    [isEnrollmentOpen, setEnrollmentOpen] = useState(false);
  const [editingId, setEditingId] = useState(null),
    [historyEditingId, setHistoryEditingId] = useState(null),
    [editForm, setEditForm] = useState({ name: "", studentId: "", email: "", course: "BSIT", yearLevel: "3", block: "A" }),
    [editFile, setEditFile] = useState(null),
    [editFilePreview, setEditFilePreview] = useState(""),
    [savingEdit, setSavingEdit] = useState(false);
  const filePreviewUrl = useRef("");
  const editFilePreviewUrl = useRef("");
  useEffect(() => () => {
    if (filePreviewUrl.current) URL.revokeObjectURL(filePreviewUrl.current);
    if (editFilePreviewUrl.current) URL.revokeObjectURL(editFilePreviewUrl.current);
  }, []);
  const [theme, setTheme] = useState(getTheme),
    [online, setOnline] = useState(true),
    [connection, setConnection] = useState("standby"),
    [notifications, setNotifications] = useState([]),
    [systemAlert, setSystemAlert] = useState(""),
    [debug, setDebug] = useState({ fps: 0, ms: 0 });
  const access = "granted";
  const [accessError, setAccessError] = useState(""),
    [cloudLoaded, setCloudLoaded] = useState(false),
    [startupDismissed, setStartupDismissed] = useState(false);
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
    store("attendance-sessions", sessions);
  }, [sessions]);
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
          sessions: Array.isArray(value.sessions) ? value.sessions : [],
        };
        // On a new database, keep local records long enough to migrate them once.
        const initial = next.students.length || next.records.length || next.sessions.length
          ? next
          : {
              students: read("attendance-students"),
              records: read("attendance-records"),
              classes: read("attendance-classes"),
              sessions: read("attendance-sessions"),
            };
        lastCloudValue.current = JSON.stringify(next);
        setStudents(initial.students);
        setRecords(initial.records);
        setClasses(initial.classes?.length ? initial.classes : DEFAULT_CLASSES);
        setSessions(Array.isArray(initial.sessions) ? initial.sessions : []);
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
    const next = { students, records, classes: activeClasses, sessions },
      serialized = JSON.stringify(next);
    if (serialized === lastCloudValue.current) return;
    lastCloudValue.current = serialized;
    saveAttendanceStore(next).catch((cause) => {
      const message = cause.message || "Could not save changes to the MySQL attendance store.";
      setAccessError(message);
      showError(message);
    });
  }, [access, activeClasses, cloudLoaded, records, sessions, showError, students]);
  useEffect(() => {
    applyTheme(theme);
    return watchSystemTheme(theme, () => applyTheme("system"));
  }, [theme]);
  useEffect(() => {
    if (!cameraStarting) return undefined;
    const tick = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [cameraStarting]);
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
        // The preview video is mirrored like a normal selfie camera. Mirror
        // coordinates in drawing code instead of mirroring the canvas so text
        // labels remain readable.
        x = c.width - (b.x + b.width) * sx,
        y = b.y * sy,
        w = b.width * sx,
        h = b.height * sy,
        label = found ? found.student.name : "Unknown face";
      ctx.strokeStyle = isSpoof
        ? colors.getPropertyValue("--danger")
        : found && livenessState === "live"
          ? colors.getPropertyValue("--good")
          : colors.getPropertyValue("--warning");
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.font = "600 14px system-ui";
      ctx.fillStyle = colors.getPropertyValue("--primary");
      const labelWidth = Math.max(130, ctx.measureText(label).width + 16);
      ctx.fillRect(x, Math.max(0, y - 27), labelWidth, 25);
      ctx.fillStyle = colors.getPropertyValue("--surface");
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
  const activeSession = useMemo(
    () => sessions.find((item) => item.section === section && item.date === date) || null,
    [date, section, sessions],
  );
  const editingStudent = students.find((student) => student.studentId === editingId);
  const attendancePolicyReady = isAttendancePolicyReady(activeSession);
  const saveSessionPolicy = useCallback((nextSession) => {
    setSessions((all) => {
      const index = all.findIndex(
        (item) => item.section === nextSession.section && item.date === nextSession.date,
      );
      if (index >= 0) {
        const copy = [...all];
        copy[index] = nextSession;
        return copy;
      }
      return [...all, nextSession];
    });
    const ranges = sessionTimeRanges(nextSession);
    setRecords((all) =>
      all.map((record) => {
        if (record.section !== nextSession.section || record.date !== nextSession.date) return record;
        return {
          ...record,
          status: determineAttendanceStatus(
            record.time,
            ranges.timeInStart,
            ranges.timeInEnd,
            ranges.lateStart,
            ranges.lateEnd,
          ),
        };
      }),
    );
  }, []);
  const present = useCallback(
    (student, frame) => {
      if (!isAttendancePolicyReady(activeSession) || date !== todayManila()) return;
      const scanTime = nowManilaTime();
      const phase = liveAttendancePhaseAt(scanTime, activeSession);
      if (!phase) return;
      const attendanceKey = `${date}|${section}|${student.studentId}`;
      const existingRecord = records.find(
        (record) =>
          record.studentId === student.studentId &&
          record.date === date &&
          record.section === section,
      );
      if (phase === "TimeOut") {
        const actionKey = `out|${attendanceKey}`;
        if (!existingRecord || existingRecord.timeOut || attendanceActions.current.has(actionKey))
          return;
        attendanceActions.current.add(actionKey);
        const record = { ...existingRecord, timeOut: scanTime };
        setRecords((all) =>
          all.map((item) => item.id === record.id ? record : item),
        );
        socket.current?.send({ type: "attendance", id: record.id, record });
        return;
      }

      const actionKey = `in|${attendanceKey}`;
      if (existingRecord || attendanceActions.current.has(actionKey)) return;
      attendanceActions.current.add(actionKey);
      const record = {
        id: crypto.randomUUID(),
        studentId: student.studentId,
        name: student.name,
        date,
        section,
        time: scanTime,
        status: phase,
        timeOut: null,
      };
      setRecords((all) =>
        all.some(
          (item) =>
            item.studentId === student.studentId &&
            item.date === date &&
            item.section === section,
        )
          ? all
          : [...all, record],
      );
      socket.current?.send({ type: "attendance", id: record.id, record });
      if (!emailedRecords.current.has(record.id)) {
        emailedRecords.current.add(record.id);
        const attendancePhoto = frame.toDataURL("image/jpeg", 0.65);
        void sendAttendanceEmail(student, record, attendancePhoto)
          .then((sent) => {
            if (sent) {
              const notificationId = `email-${record.id}`;
              setNotifications((items) =>
                [
                  {
                    id: notificationId,
                    message: `Attendance email sent to ${student.name}.`,
                  },
                  ...items,
                ].slice(0, 4),
              );
              setTimeout(
                () => setNotifications((items) => items.filter((item) => item.id !== notificationId)),
                3000,
              );
            }
          })
          .catch((error) => {
            const notificationId = `email-error-${record.id}`;
            setNotifications((items) =>
              [
                {
                  id: notificationId,
                  message: `Attendance saved for ${student.name}. ${emailErrorMessage(error)}`,
                },
                ...items,
              ].slice(0, 4),
            );
            setTimeout(
              () => setNotifications((items) => items.filter((item) => item.id !== notificationId)),
              3000,
            );
          });
      }
    },
    [activeSession, date, records, section],
  );
  const clearAttendanceActions = (record) => {
    const key = `${record.date}|${record.section}|${record.studentId}`;
    attendanceActions.current.delete(`in|${key}`);
    attendanceActions.current.delete(`out|${key}`);
  };
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
        const selectedDateIsToday = date === todayManila();
        const attendancePhase =
          attendancePolicyReady && selectedDateIsToday
            ? liveAttendancePhaseAt(nowManilaTime(), activeSession)
            : null;
        const policyUnavailable = Boolean(found) && !attendancePolicyReady;
        const dateUnavailable = Boolean(found) && attendancePolicyReady && !selectedDateIsToday;
        const existingAttendance = found && records.find(
          (record) =>
            record.studentId === found.student.studentId &&
            record.date === date &&
            record.section === section,
        );
        const timeOutUnavailable =
          Boolean(found) &&
          attendancePhase === "TimeOut" &&
          (!existingAttendance || existingAttendance.timeOut);
        const attendanceWindowClosed =
          Boolean(found) &&
          attendancePolicyReady &&
          selectedDateIsToday &&
          !attendancePhase;
        if (found) {
          if (
            !policyUnavailable &&
            !dateUnavailable &&
            !attendanceWindowClosed &&
            !timeOutUnavailable
          ) {
            try {
              liveness = await verifyLiveness(frame.current);
              if (liveness.live) {
                present(found.student, frame.current);
              }
            } catch (livenessError) {
              console.warn("Liveness verification failed", livenessError);
              livenessFailed = true;
            }
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
          message: policyUnavailable
            ? "Attendance time rules are not set for this class and date. No attendance record or email was created."
            : dateUnavailable
              ? "Live attendance is available only on the session date. No attendance record or email was created."
              : attendanceWindowClosed
                ? "The attendance check-in window is not open or has ended. No attendance record or email was created."
                : timeOutUnavailable
                  ? existingAttendance?.timeOut
                    ? `${found.student.name} has already checked out.`
                    : "No check-in record was found for this time-out window."
            : found && liveness?.live
              ? attendancePhase === "TimeOut"
                ? `${found.student.name} verified; check-out recorded.`
                : `${found.student.name} recognized and verified live.`
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
    [activeSession, attendancePolicyReady, date, debugMode, paint, present, records, section, ui],
  );
  const start = useCallback(async () => {
    if (startingCamera.current) return;
    startingCamera.current = true;
    setCameraRequested(true);
    setCameraStarting(true);
    stop();
    stopCamera(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraConnected(false);
    setReady(false);
    setError("");
    setElapsed(0);
    setStage("Waiting for camera permission");
    try {
      // The video element only exists after the attendance workspace mounts.
      // Never start the camera from the full-page loading screen.
      if (!video.current) {
        throw new Error("Camera preview is not ready yet. Leave this screen and try Start camera again.");
      }

      stopCamera(stream.current);
      stream.current = null;
      video.current.srcObject = null;
      setCameraConnected(false);

      // Permission must come from this click so browsers allow getUserMedia.
      const cameraStream = await requestCamera();
      if (!mounted.current) {
        stopCamera(cameraStream);
        return;
      }
      if (!video.current) {
        stopCamera(cameraStream);
        throw new Error("Camera preview disappeared before the stream could attach. Retry the scanner.");
      }

      stream.current = cameraStream;
      video.current.srcObject = cameraStream;
      if (video.current.readyState < 2) {
        await new Promise((resolve, reject) => {
          const node = video.current;
          const onReady = () => {
            node.removeEventListener("loadeddata", onReady);
            node.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            node.removeEventListener("loadeddata", onReady);
            node.removeEventListener("error", onError);
            reject(new Error("The camera stream could not be displayed."));
          };
          node.addEventListener("loadeddata", onReady, { once: true });
          node.addEventListener("error", onError, { once: true });
        });
      }
      await video.current.play();
      if (!mounted.current) return;
      setCameraConnected(true);

      setStage("Loading face model");
      await timed(
        loadDetector(),
        "Face models did not finish loading in 60 seconds. Check your internet connection and retry.",
        60000,
      );
      if (!mounted.current) return;
      frame.current = createInferenceCanvas(INFERENCE_WIDTH, INFERENCE_HEIGHT);
      setStage("Connected");
      setReady(true);
      running.current = true;
      raf.current = requestAnimationFrame(loop);
    } catch (cause) {
      if (!mounted.current) return;
      const cameraIsConnected = stream.current?.active && video.current?.srcObject === stream.current;
      const message = cameraIsConnected
        ? `Camera is connected, but the face scanner could not load. ${cause?.message || "Check the network and retry."}`
        : cameraErrorMessage(cause);
      if (!cameraIsConnected) {
        stopCamera(stream.current);
        stream.current = null;
        if (video.current) video.current.srcObject = null;
        setCameraConnected(false);
      }
      setStage(cameraIsConnected ? "Face scanner could not load" : "Camera could not start");
      setError(message);
      showError(message);
    } finally {
      startingCamera.current = false;
      if (mounted.current) setCameraStarting(false);
    }
  }, [loop, showError, stop]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
      stopCamera(stream.current);
      stream.current = null;
      if (video.current) video.current.srcObject = null;
    };
  }, [stop]);
  // Preload face models after attendance data is ready so Start camera is faster.
  useEffect(() => {
    if (!cloudLoaded) return undefined;
    let cancelled = false;
    void loadDetector().catch((cause) => {
      if (!cancelled) console.warn("Face model preload failed", cause);
    });
    return () => { cancelled = true; };
  }, [cloudLoaded]);
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
  const closeEnrollment = () => {
    selectPortraitFile(null, setFile, setFilePreview, filePreviewUrl);
    setEnrollmentOpen(false);
  };
  const closeEdit = () => {
    selectPortraitFile(null, setEditFile, setEditFilePreview, editFilePreviewUrl);
    setEditingId(null);
  };
  const enroll = async (event) => {
    event.preventDefault();
    if (!file) return setNotice("Choose a reference portrait.");
    if (!isValidStudentId(form))
      return setNotice("Enter a 4-digit year and a 3-digit student number.");
    const nextId = formatStudentId(form);
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
      selectPortraitFile(null, setFile, setFilePreview, filePreviewUrl);
      setForm({ name: "", ...studentIdFields(), email: "", course, yearLevel, block });
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
    selectPortraitFile(null, setEditFile, setEditFilePreview, editFilePreviewUrl);
    setEditingId(student.studentId);
    setEditForm({
      name: student.name,
      ...studentIdFields(student.studentId),
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
    if (!isValidStudentId(editForm))
      return setNotice("Enter a 4-digit year and a 3-digit student number.");
    setSavingEdit(true);
    try {
      const nextId = formatStudentId(editForm);
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
      records
        .filter((record) => record.studentId === editingId)
        .forEach(clearAttendanceActions);
      setRecords((all) =>
        all.map((record) => record.studentId === editingId
          ? { ...record, studentId: nextId, name: nextName }
          : record),
      );
      selectPortraitFile(null, setEditFile, setEditFilePreview, editFilePreviewUrl);
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
    records
      .filter((record) => record.studentId === student.studentId)
      .forEach(clearAttendanceActions);
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
    const sectionValue = historyDraft.section.trim();
    const policy = sessions.find(
      (item) => item.section === sectionValue && item.date === historyDraft.date,
    );
    const policyRanges = policy ? sessionTimeRanges(policy) : null;
    const next = {
      studentId: historyDraft.studentId,
      name: student?.name || "",
      date: historyDraft.date,
      time: historyDraft.time.trim(),
      section: sectionValue,
      timeOut: historyDraft.timeOut?.trim() || null,
      status: policy
        ? determineAttendanceStatus(
            historyDraft.time.trim(),
            policyRanges.timeInStart,
            policyRanges.timeInEnd,
            policyRanges.lateStart,
            policyRanges.lateEnd,
          )
        : "Present",
    };
    if (!next.studentId || !next.date || !next.time || !next.section)
      return setNotice("Choose a student, date, time, and section.");
    if (records.some((item) => item.studentId === next.studentId && item.date === next.date && item.section === next.section && item.id !== historyEditingId))
      return setNotice("This student already has attendance for that class and date.");
    if (historyEditingId) {
      const previous = records.find((item) => item.id === historyEditingId);
      if (previous) clearAttendanceActions(previous);
      clearAttendanceActions(next);
      setRecords((all) => all.map((item) => item.id === historyEditingId ? { ...item, ...next } : item));
      setNotice("Attendance record updated.");
    } else {
      setRecords((all) => [...all, { id: crypto.randomUUID(), ...next }]);
      setNotice("Attendance record added.");
    }
    setHistoryEditingId(null);
    setHistoryDraft({ studentId: "", date: today(), time: "", section, timeOut: "" });
  };
  const editHistoryRecord = (record) => {
    setHistoryEditingId(record.id);
    setHistoryDraft({
      studentId: record.studentId,
      date: record.date,
      time: record.time,
      section: record.section,
      timeOut: record.timeOut || "",
    });
    setNotice("");
  };
  const deleteHistoryRecord = (record) => {
    if (!window.confirm(`Delete the attendance record for ${record.name}?`)) return;
    clearAttendanceActions(record);
    setRecords((all) => all.filter((item) => item.id !== record.id));
    setNotice("Attendance record deleted.");
  };
  const deleteAllHistory = () => {
    if (!records.length) return;
    if (!window.confirm(`Delete all ${records.length} attendance record(s)? This cannot be undone.`)) return;
    attendanceActions.current.clear();
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
  if (!startupDismissed && !cloudLoaded) {
    return (
      <LoadingScreen
        message="Loading attendance records…"
        steps={[{ label: "Attendance data", status: accessError ? "error" : "loading" }]}
        error={accessError}
        onContinue={accessError ? () => {
          if (!cloudLoaded) setCloudLoaded(true);
          setStartupDismissed(true);
        } : undefined}
      />
    );
  }
  return (
    <main className={`attendance-app${embedded ? " attendance-app-embedded" : ""}`}>
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
      {embedded ? (
        <header className="topbar topbar-embedded">
          <div>
            <p className="eyebrow">Live classroom check-in</p>
            <h1 className="embedded-heading">Student attendance</h1>
          </div>
          <div className="header-controls">
            <span className={`connection ${connection}`}>
              Notifications:{" "}
              {connection === "standby" ? "not configured" : connection}
            </span>
            <span className={`live-pill${online ? " on" : ""}`}>
              {online ? "ONLINE" : "OFFLINE"}
            </span>
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
      ) : (
        <header className="topbar">
          <div>
            <LewisSeeLogo className="brand-mark small" />
            <span className="brand-name">LewisSee</span>
          </div>
          <div className="header-controls">
            <span className="staff-info">
              Signed in: {staffUser?.displayName || staffUser?.name || staffUser?.email || "Instructor"}
            </span>
            <span className={`connection ${connection}`}>
              Notifications:{" "}
              {connection === "standby" ? "not configured" : connection}
            </span>
            <button className="sign-out" onClick={onSignOut}>
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
      )}
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
      <section className={`page-heading${embedded ? " page-heading-compact" : ""}`}>
        <div>
          {!embedded && <p className="eyebrow">LIVE CLASSROOM CHECK-IN</p>}
          {!embedded && <h1>Student attendance</h1>}
          <p className="muted">
            Performance-capped face recognition for live attendance.
          </p>
        </div>
        <div className="filters">
          <label>
            Date
            <input
              type="date"
              disabled={!cloudLoaded}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Course
            <select
              disabled={!cloudLoaded}
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
            <select disabled={!cloudLoaded} value={yearLevel} onChange={(e) => {
              const next = activeClasses.find((item) => item.course === course && String(item.yearLevel) === e.target.value);
              if (next) { setYearLevel(String(next.yearLevel)); setBlock(next.block); }
            }}>
              {yearsForCourse.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Block
            <select disabled={!cloudLoaded} value={block} onChange={(e) => setBlock(e.target.value)}>
              {blocksForClass.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>
      <SessionPolicyForm
        section={section}
        date={date}
        session={activeSession}
        onSave={saveSessionPolicy}
        disabled={!cloudLoaded}
      />
      <section className="attendance-grid">
        <article className="camera-card">
          <div className="section-title">
            <div>
              <p className="eyebrow">CAMERA SCANNER</p>
              <h2>Recognition desk</h2>
            </div>
            <span className={`live-pill ${ready ? "on" : ""}`}>
              {ready ? "LIVE" : cameraStarting ? "STARTING" : error ? "ERROR" : "OFF"}
            </span>
          </div>
          <div className={`camera-wrap ${cameraConnected || ready ? "visible previewing" : ""}`}>
            <video ref={video} muted playsInline />
            <canvas ref={overlay} style={{ transform: "none" }} />
            {!ready && (
              <Loader
                stage={stage}
                error={error}
                elapsed={elapsed}
                retry={start}
                requested={cameraRequested}
                starting={cameraStarting}
              />
            )}
            {match && (
              <div className="capture-overlay">
                {match.student.photo && (
                  <img
                    src={match.student.photo}
                    alt={`${match.student.name} enrolled portrait`}
                  />
                )}
                <div>
                  <b>{match.student.name}</b>
                  <small>Student ID: {match.student.studentId}</small>
                  <span>Recognized</span>
                </div>
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
              <p className="eyebrow">{formatDate(date)}</p>
              <h2>Today’s attendance</h2>
            </div>
            <strong>{attendance.length} checked in</strong>
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
                  <div className="record-meta">
                    <AttendanceStatusBadge status={record.status || "Present"} />
                    <time>{formatClock12Hour(record.time)}</time>
                  </div>
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
          <button type="button" onClick={() => {
            selectPortraitFile(null, setFile, setFilePreview, filePreviewUrl);
            setEnrollmentOpen(true);
          }}>
            Enroll student
          </button>
        </div>
        {isEnrollmentOpen && (
          <div className="student-modal-backdrop" role="presentation">
            <form
              className="student-modal"
              onSubmit={enroll}
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-modal-title"
              aria-describedby="student-modal-description"
            >
              <header className="student-modal-header">
                <div>
                  <p className="eyebrow">STUDENT DIRECTORY</p>
                  <h2 id="student-modal-title">Enroll a student</h2>
                  <p id="student-modal-description">
                    Add the student’s details and a clear reference portrait.
                  </p>
                </div>
                <button className="modal-close" type="button" aria-label="Close enrollment form" onClick={closeEnrollment}>×</button>
              </header>
              <div className="student-modal-fields">
                <label>
                  Full name
                  <input
                    required
                    autoComplete="name"
                    placeholder="e.g. Alex Santos"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label>
                  Student ID
                  <div className="student-id-input" role="group" aria-label="Student ID">
                    <span aria-hidden="true">C-</span>
                    <input
                      required
                      aria-label="Student ID year"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      placeholder="2026"
                      value={form.studentIdYear}
                      onChange={(e) => setForm({ ...form, studentIdYear: e.target.value })}
                    />
                    <span aria-hidden="true">-</span>
                    <input
                      required
                      aria-label="Three-digit student number"
                      inputMode="numeric"
                      pattern="[0-9]{3}"
                      maxLength={3}
                      placeholder="781"
                      value={form.studentIdNumber}
                      onChange={(e) => setForm({ ...form, studentIdNumber: e.target.value })}
                    />
                  </div>
                  <small>Enter the 4-digit year and 3-digit student number.</small>
                </label>
                <label>
                  <span className="field-label">
                    Email <span className="field-optional">Optional</span>
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="student@example.com"
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
                    onChange={(e) => selectPortraitFile(e.target.files?.[0] || null, setFile, setFilePreview, filePreviewUrl)}
                  />
                  <small>Choose a clear, front-facing photo in JPG, PNG, or WEBP format.</small>
                  <div className={`portrait-preview ${filePreview ? "" : "empty"}`}>
                    {filePreview ? (
                      <img src={filePreview} alt="Selected student portrait preview" />
                    ) : (
                      <span className="portrait-preview-placeholder">No portrait selected</span>
                    )}
                    <small>{filePreview ? "Selected portrait preview" : "Choose an image to preview it here."}</small>
                  </div>
                </label>
              </div>
              <footer className="student-modal-actions">
                <button className="modal-cancel" type="button" disabled={enrolling} onClick={closeEnrollment}>Cancel</button>
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
              <button className="modal-close" type="button" aria-label="Close edit form" onClick={closeEdit}>×</button>
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
                <div className="student-id-input" role="group" aria-label="Student ID">
                  <span aria-hidden="true">C-</span>
                  <input
                    required
                    aria-label="Student ID year"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="2026"
                    value={editForm.studentIdYear}
                    onChange={(e) =>
                      setEditForm({ ...editForm, studentIdYear: e.target.value })
                    }
                  />
                  <span aria-hidden="true">-</span>
                  <input
                    required
                    aria-label="Three-digit student number"
                    inputMode="numeric"
                    pattern="[0-9]{3}"
                    maxLength={3}
                    placeholder="781"
                    value={editForm.studentIdNumber}
                    onChange={(e) =>
                      setEditForm({ ...editForm, studentIdNumber: e.target.value })
                    }
                  />
                </div>
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
                  onChange={(e) => selectPortraitFile(e.target.files?.[0] || null, setEditFile, setEditFilePreview, editFilePreviewUrl)}
                />
                <div className={`portrait-preview ${editFilePreview || editingStudent?.photo ? "" : "empty"}`}>
                  {editFilePreview || editingStudent?.photo ? (
                    <img
                      src={editFilePreview || editingStudent.photo}
                      alt={`${editForm.name || "Student"} portrait preview`}
                    />
                  ) : (
                    <span className="portrait-preview-placeholder">No portrait available</span>
                  )}
                  <small>{editFilePreview ? "Replacement portrait preview" : "Current saved portrait"}</small>
                </div>
              </label>
              <button disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={closeEdit}>
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
        {notice && <p className="workspace-notice history-notice">{notice}</p>}
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
            <label>Time-in<input type="time" step="1" value={historyDraft.time} onChange={(event) => setHistoryDraft({ ...historyDraft, time: event.target.value })} required /></label>
            <label>Time-out<input type="time" step="1" value={historyDraft.timeOut || ""} onChange={(event) => setHistoryDraft({ ...historyDraft, timeOut: event.target.value })} /></label>
            <label>Class / section
              <select value={historyDraft.section} onChange={(event) => setHistoryDraft({ ...historyDraft, section: event.target.value })} required>
                <option value="">Select class</option>
                {activeClasses.map((item) => <option key={classLabel(item)} value={classLabel(item)}>{classLabel(item)}</option>)}
              </select>
            </label>
            <div className="form-actions"><button>{historyEditingId ? "Save record" : "Add record"}</button>{historyEditingId && <button type="button" className="secondary-button" onClick={() => { setHistoryEditingId(null); setHistoryDraft({ studentId: "", date: today(), time: "", section, timeOut: "" }); }}>Cancel</button>}</div>
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
            <div className="history-table-wrap"><table><thead><tr><th>Student</th><th>Date</th><th>Class</th><th>Time-in</th><th>Status</th><th>Time-out</th><th>Actions</th></tr></thead><tbody>
              {displayedHistory.map((record) => <tr key={record.id}><td><b>{record.name}</b><small>{record.studentId}</small></td><td>{formatDate(record.date)}</td><td>{record.section}</td><td>{formatClock12Hour(record.time)}</td><td><AttendanceStatusBadge status={record.status || "Present"} /></td><td>{record.timeOut ? formatClock12Hour(record.timeOut) : "—"}</td><td className="row-actions"><button type="button" className="secondary-button" onClick={() => editHistoryRecord(record)}>Edit</button><button type="button" className="danger-button" onClick={() => deleteHistoryRecord(record)}>Delete</button></td></tr>)}
              {!records.length && <tr><td colSpan="7" className="empty">No attendance records yet.</td></tr>}
              {!!records.length && !displayedHistory.length && <tr><td colSpan="7" className="empty">No records match your search or class filter.</td></tr>}
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
      {notice && page !== "students" && page !== "history" && <p className="workspace-notice">{notice}</p>}
      {!!notifications.length && (
        <div className="notification-stack" aria-live="polite">
          {notifications.map((item) => (
            <aside className="notification" key={item.id}>
              <span>{item.message || "New server notification"}</span>
              <button
                type="button"
                className="notification-close"
                aria-label="Dismiss notification"
                onClick={() => setNotifications((items) => items.filter((notification) => notification.id !== item.id))}
              >
                ×
              </button>
            </aside>
          ))}
        </div>
      )}
    </main>
  );
}
