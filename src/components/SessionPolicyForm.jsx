import { useEffect, useState } from "react";
import { parseClockToMinutes, sessionTimeRanges } from "../attendancePolicy";

const emptyDraft = {
  mode: "timed",
  rosterScope: "class",
  rosterSelection: { course: "", yearLevel: "", block: "" },
  timeInStart: "08:00",
  timeInEnd: "08:15",
  lateStart: "08:16",
  lateEnd: "08:30",
  timeOutStart: "",
  timeOutEnd: "",
};

const getDraft = (session) => {
  if (!session) return emptyDraft;
  const ranges = sessionTimeRanges(session);
  return {
    mode: session.mode || "timed",
    rosterScope: session.rosterScope || "class",
    rosterSelection: {
      course: session.rosterSelection?.course || "",
      yearLevel: session.rosterSelection?.yearLevel ? String(session.rosterSelection.yearLevel) : "",
      block: session.rosterSelection?.block || "",
      studentId: session.rosterSelection?.studentId || "",
    },
    timeInStart: ranges.timeInStart || "08:00",
    timeInEnd: ranges.timeInEnd || "08:15",
    lateStart: ranges.lateStart || "",
    lateEnd: ranges.lateEnd || "",
    timeOutStart: session.timeOutStart || session.timeOut || "",
    timeOutEnd: session.timeOutEnd || "",
  };
};

/**
 * Instructor form for creating or editing time ranges for one class session.
 */
export default function SessionPolicyForm({
  section,
  date,
  session = null,
  onSave,
  onEnd,
  disabled = false,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(getDraft(session));
    setMessage("");
  }, [session, section, date]);

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!section || !date) {
      setMessage("Choose a class and date before saving the policy.");
      return;
    }
    if (draft.mode === "manual") {
      const saved = onSave({
        id: session?.id || crypto.randomUUID(),
        section,
        date,
        rosterScope: draft.rosterScope,
        rosterSelection: draft.rosterScope === "selection" ? draft.rosterSelection : {},
        mode: "manual",
        // Switching from scheduled → manual must open attendance immediately.
        // Only preserve "ended" when the session was already manual.
        ended: session?.mode === "manual" ? Boolean(session.ended) : false,
        timeInStart: "00:00",
        timeInEnd: "23:59",
        lateStart: null,
        lateEnd: null,
        timeOutStart: null,
        timeOutEnd: null,
      });
      if (saved === false) {
        setMessage("Only one all-students attendance session can be saved per date.");
        return;
      }
      setMessage(
        session
          ? "Manual attendance is open for today. Keep scanning — check-ins and emails are unlocked."
          : "Manual attendance is ready for today.",
      );
      return;
    }

    const timeInStart = parseClockToMinutes(draft.timeInStart);
    const timeInEnd = parseClockToMinutes(draft.timeInEnd);
    if (timeInStart == null || timeInEnd == null || timeInEnd <= timeInStart) {
      setMessage("Enter a valid time-in start and end. The end must be after the start.");
      return;
    }

    const hasLateStart = Boolean(draft.lateStart);
    const hasLateEnd = Boolean(draft.lateEnd);
    const lateStart = parseClockToMinutes(draft.lateStart);
    const lateEnd = parseClockToMinutes(draft.lateEnd);
    if (hasLateStart !== hasLateEnd) {
      setMessage("Enter both start and end times for the late period, or leave both empty.");
      return;
    }
    if (
      hasLateStart &&
      (lateStart == null || lateEnd == null || lateStart <= timeInEnd || lateEnd < lateStart)
    ) {
      setMessage("The late period must start after time-in ends and its end must be after its start.");
      return;
    }

    const hasTimeOutStart = Boolean(draft.timeOutStart);
    const hasTimeOutEnd = Boolean(draft.timeOutEnd);
    const timeOutStart = parseClockToMinutes(draft.timeOutStart);
    const timeOutEnd = parseClockToMinutes(draft.timeOutEnd);
    if (hasTimeOutStart !== hasTimeOutEnd) {
      setMessage("Enter both start and end times for time-out, or leave both empty.");
      return;
    }
    if (
      hasTimeOutStart &&
      (
        timeOutStart == null ||
        timeOutEnd == null ||
        timeOutEnd <= timeOutStart ||
        timeOutStart <= (hasLateStart ? lateEnd : timeInEnd)
      )
    ) {
      setMessage("Time-out must be a valid range after the time-in and late periods.");
      return;
    }

    const saved = onSave({
      id: session?.id || crypto.randomUUID(),
      section,
      date,
      rosterScope: draft.rosterScope,
      rosterSelection: draft.rosterScope === "selection" ? draft.rosterSelection : {},
      mode: "timed",
      ended: false,
      timeInStart: draft.timeInStart,
      timeInEnd: draft.timeInEnd,
      lateStart: hasLateStart ? draft.lateStart : null,
      lateEnd: hasLateEnd ? draft.lateEnd : null,
      timeOutStart: hasTimeOutStart ? draft.timeOutStart : null,
      timeOutEnd: hasTimeOutEnd ? draft.timeOutEnd : null,
    });
    if (saved === false) {
      setMessage("Only one all-students attendance session can be saved per date.");
      return;
    }
    setMessage(session ? "Attendance policy updated." : "Attendance policy saved.");
  };

  return (
    <form className="session-policy-form management-card" onSubmit={submit}>
      <div className="section-title">
        <div>
          <p className="eyebrow">ATTENDANCE POLICY</p>
          <h2>{session ? "Edit session rules" : "Set session rules"}</h2>
        </div>
      </div>
      <p className="muted session-policy-meta">
        {section || "No class"} · {date || "No date"} · Asia/Manila (PST)
      </p>
      <label className="session-policy-mode">
        Attendance mode
        <select
          disabled={disabled}
          value={draft.mode}
          onChange={(event) => update("mode", event.target.value)}
        >
          <option value="timed">Schedule mode</option>
          <option value="manual">Manual Mode</option>
        </select>
      </label>
      <label className="session-policy-mode">
        Attendance roster
        <select
          disabled={disabled}
          value={draft.rosterScope}
          onChange={(event) => update("rosterScope", event.target.value)}
        >
          <option value="class">Selected course / year / block</option>
          {session?.rosterScope === "selection" && (
            <option value="selection">Existing filtered roster (unchanged)</option>
          )}
          <option value="all">All enrolled students</option>
        </select>
      </label>
      <p className="muted session-policy-help">
        {draft.rosterScope === "all"
          ? "This session can recognize every enrolled student. Attendance is recorded under each student's own class."
          : draft.rosterScope === "selection"
            ? "This saved session keeps its existing roster filter. Choose another roster option to replace it."
          : "Only students assigned to the selected course, year, and block can be recognized."}
      </p>
      {draft.mode === "manual" ? (
        <p className="muted session-policy-help">
          Save this policy to allow verified check-ins at any time today. Use the
          “Attendance ends” button to stop accepting attendance for this class.
        </p>
      ) : (
        <>
          <p className="muted session-policy-help">
            Live scans create records and send email only after these rules are saved.
            Live check-ins are accepted only during the saved Time-in or Late windows.
            Outside those periods the scanner will not save a record or send an email.
            A verified scan during an optional Time-out window records a check-out only.
          </p>
          <div className="session-policy-grid">
            <fieldset className="session-policy-range">
              <legend>Time-in</legend>
              <label>
                Start
                <input
                  type="time"
                  required
                  disabled={disabled}
                  value={draft.timeInStart}
                  onChange={(event) => update("timeInStart", event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  required
                  disabled={disabled}
                  value={draft.timeInEnd}
                  onChange={(event) => update("timeInEnd", event.target.value)}
                />
              </label>
            </fieldset>
            <fieldset className="session-policy-range">
              <legend>Late period (optional)</legend>
              <label>
                Start
                <input
                  type="time"
                  disabled={disabled}
                  value={draft.lateStart}
                  onChange={(event) => update("lateStart", event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  disabled={disabled}
                  value={draft.lateEnd}
                  onChange={(event) => update("lateEnd", event.target.value)}
                />
              </label>
            </fieldset>
            <fieldset className="session-policy-range">
              <legend>Time-out (optional)</legend>
              <label>
                Start
                <input
                  type="time"
                  disabled={disabled}
                  value={draft.timeOutStart}
                  onChange={(event) => update("timeOutStart", event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  disabled={disabled}
                  value={draft.timeOutEnd}
                  onChange={(event) => update("timeOutEnd", event.target.value)}
                />
              </label>
            </fieldset>
          </div>
        </>
      )}
      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          {session ? "Update policy" : "Save policy"}
        </button>
        {session?.mode === "manual" && onEnd && (
          <button type="button" className="secondary-button" disabled={disabled} onClick={onEnd}>
            {session.ended ? "Resume attendance" : "Attendance ends"}
          </button>
        )}
      </div>
      {message && <p className="enroll-message">{message}</p>}
    </form>
  );
}
