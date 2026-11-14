import { useEffect, useState } from "react";

const emptyDraft = {
  requiredTimeIn: "08:00",
  gracePeriodMinutes: "15",
  lateThresholdMinutes: "30",
  timeOut: "",
};

/**
 * Instructor form for creating/editing time-based rules for one class session.
 * Props expect the current section + date and an optional existing session object.
 */
export default function SessionPolicyForm({
  section,
  date,
  session = null,
  onSave,
  disabled = false,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft({
      requiredTimeIn: session?.requiredTimeIn || "08:00",
      gracePeriodMinutes:
        session?.gracePeriodMinutes == null ? "" : String(session.gracePeriodMinutes),
      lateThresholdMinutes:
        session?.lateThresholdMinutes == null ? "" : String(session.lateThresholdMinutes),
      timeOut: session?.timeOut || "",
    });
    setMessage("");
  }, [session, section, date]);

  const submit = (event) => {
    event.preventDefault();
    if (!section || !date) {
      setMessage("Choose a class and date before saving the policy.");
      return;
    }
    if (!draft.requiredTimeIn) {
      setMessage("Required time-in is mandatory.");
      return;
    }
    const grace =
      draft.gracePeriodMinutes === "" ? null : Number(draft.gracePeriodMinutes);
    const late =
      draft.lateThresholdMinutes === "" ? null : Number(draft.lateThresholdMinutes);
    if (grace != null && (Number.isNaN(grace) || grace < 0)) {
      setMessage("Grace period must be a non-negative number of minutes.");
      return;
    }
    if (late != null && (Number.isNaN(late) || late < 0)) {
      setMessage("Late threshold must be a non-negative number of minutes.");
      return;
    }
    if (grace != null && late != null && late < grace) {
      setMessage("Late threshold must be greater than or equal to grace period.");
      return;
    }
    onSave({
      id: session?.id || crypto.randomUUID(),
      section,
      date,
      requiredTimeIn: draft.requiredTimeIn,
      gracePeriodMinutes: grace,
      lateThresholdMinutes: late,
      timeOut: draft.timeOut || null,
    });
    setMessage(session ? "Attendance policy updated." : "Attendance policy saved.");
  };

  return (
    <form className="session-policy-form management-card" onSubmit={submit}>
      <div className="section-title">
        <div>
          <p className="eyebrow">TIME-BASED POLICY</p>
          <h2>{session ? "Edit session rules" : "Set session rules"}</h2>
        </div>
      </div>
      <p className="muted session-policy-meta">
        {section || "No class"} · {date || "No date"} · Asia/Manila (PST)
      </p>
      <div className="session-policy-grid">
        <label>
          Required time-in
          <input
            type="time"
            required
            disabled={disabled}
            value={draft.requiredTimeIn}
            onChange={(event) => setDraft({ ...draft, requiredTimeIn: event.target.value })}
          />
        </label>
        <label>
          Grace period (minutes)
          <input
            type="number"
            min="0"
            max="240"
            placeholder="Optional"
            disabled={disabled}
            value={draft.gracePeriodMinutes}
            onChange={(event) => setDraft({ ...draft, gracePeriodMinutes: event.target.value })}
          />
        </label>
        <label>
          Late threshold (minutes)
          <input
            type="number"
            min="0"
            max="720"
            placeholder="Optional"
            disabled={disabled}
            value={draft.lateThresholdMinutes}
            onChange={(event) =>
              setDraft({ ...draft, lateThresholdMinutes: event.target.value })
            }
          />
        </label>
        <label>
          Time-out
          <input
            type="time"
            disabled={disabled}
            value={draft.timeOut}
            onChange={(event) => setDraft({ ...draft, timeOut: event.target.value })}
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          {session ? "Update policy" : "Save policy"}
        </button>
      </div>
      {message && <p className="enroll-message">{message}</p>}
    </form>
  );
}
