import { useEffect, useState } from "react";
import { parseClockToMinutes, sessionTimeRanges } from "../attendancePolicy";

const emptyDraft = {
  mode: "timed",
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
      onSave({
        id: session?.id || crypto.randomUUID(),
        section,
        date,
        mode: "manual",
        ended: session?.ended || false,
        timeInStart: "00:00",
        timeInEnd: "23:59",
        lateStart: null,
        lateEnd: null,
        timeOutStart: null,
        timeOutEnd: null,
      });
      setMessage(session ? "Manual attendance settings updated." : "Manual attendance is ready.");
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

    onSave({
      id: session?.id || crypto.randomUUID(),
      section,
      date,
      mode: "timed",
      ended: false,
      timeInStart: draft.timeInStart,
      timeInEnd: draft.timeInEnd,
      lateStart: hasLateStart ? draft.lateStart : null,
      lateEnd: hasLateEnd ? draft.lateEnd : null,
      timeOutStart: hasTimeOutStart ? draft.timeOutStart : null,
      timeOutEnd: hasTimeOutEnd ? draft.timeOutEnd : null,
    });
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
          <option value="timed">Scheduled times</option>
          <option value="manual">Manual end button</option>
        </select>
      </label>
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
