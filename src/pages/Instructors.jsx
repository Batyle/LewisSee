import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveInstructor,
  deleteInstructor,
  listInstructors,
  rejectInstructor,
  suspendInstructor,
  updateInstructor,
} from "../api/adminApi";
import {
  sendInstructorDecisionEmail,
  sendInstructorUpdateEmail,
} from "../api/instructorNotifications";

const formatBlocks = (blocks = []) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return "No blocks requested";
  return blocks
    .map((block) => {
      if (typeof block === "string") return block;
      const course = block.course || "Class";
      const year = block.yearLevel ?? block.year_level ?? "?";
      return `${course} ${year}-${block.block || "?"}`;
    })
    .join(", ");
};

const formatWhen = (value) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

export default function Instructors() {
  const [instructors, setInstructors] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, active: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyUid, setBusyUid] = useState("");
  const [editingInstructor, setEditingInstructor] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", instructorId: "", newPassword: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listInstructors();
      setInstructors(data.instructors || []);
      setCounts({
        pending: data.counts?.pending ?? 0,
        active: data.counts?.active ?? 0,
        blocked: data.counts?.blocked ?? 0,
      });
    } catch (cause) {
      setError(cause.message || "Unable to load instructor requests.");
      setInstructors([]);
      setCounts({ pending: 0, active: 0, blocked: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listInstructors()
      .then((data) => {
        if (!active) return;
        setInstructors(data.instructors || []);
        setCounts({
          pending: data.counts?.pending ?? 0,
          active: data.counts?.active ?? 0,
          blocked: data.counts?.blocked ?? 0,
        });
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause.message || "Unable to load instructor requests.");
        setInstructors([]);
        setCounts({ pending: 0, active: 0, blocked: 0 });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pending = useMemo(
    () => instructors.filter((person) => person.status === "pending"),
    [instructors],
  );
  const roster = useMemo(
    () => instructors.filter((person) => person.status !== "pending"),
    [instructors],
  );

  const runAction = async (uid, action, emailDecision) => {
    setBusyUid(uid);
    setError("");
    setNotice("");
    try {
      const result = await action();
      let actionNotice = result.message || "Instructor updated.";
      if (emailDecision && result.instructor) {
        try {
          const emailResponse = await sendInstructorDecisionEmail(result.instructor, emailDecision);
          actionNotice += ` EmailJS accepted the notification for ${result.instructor.email} (HTTP ${emailResponse.status}); this does not confirm inbox delivery. Check EmailJS Email History and the recipient's spam folder.`;
        } catch (cause) {
          const emailError = cause?.text
            ? `EmailJS returned HTTP ${cause.status}: ${cause.text}`
            : cause.message || "EmailJS error.";
          actionNotice += ` The account was updated, but EmailJS rejected the notification: ${emailError}`;
        }
      }
      setNotice(actionNotice);
      await load();
    } catch (cause) {
      setError(cause.message || "Unable to update this instructor.");
    } finally {
      setBusyUid("");
    }
  };

  const removeInstructor = (person) => {
    const confirmed = window.confirm(
      `Permanently delete ${person.name} (${person.email})? This cannot be undone and may remove linked records.`,
    );
    if (confirmed) void runAction(person.uid, () => deleteInstructor(person.uid));
  };

  const beginEdit = (person) => {
    setEditingInstructor(person);
    setEditForm({ name: person.name, instructorId: person.instructorId || "", newPassword: "" });
    setError("");
    setNotice("");
  };

  const saveInstructor = async (event) => {
    event.preventDefault();
    const person = editingInstructor;
    if (!person) return;
    setBusyUid(person.uid);
    setError("");
    setNotice("");
    try {
      const changedFields = [];
      if (editForm.name.trim() !== person.name) changedFields.push("name");
      if (editForm.instructorId.trim().toUpperCase() !== (person.instructorId || "")) changedFields.push("instructor ID");
      if (editForm.newPassword) changedFields.push("password");
      const result = await updateInstructor(person.uid, {
        name: editForm.name,
        instructorId: editForm.instructorId,
        newPassword: editForm.newPassword,
      });
      let actionNotice = result.message || "Instructor details updated.";
      if (changedFields.length) {
        try {
          const emailResponse = await sendInstructorUpdateEmail(result.instructor, changedFields);
          actionNotice += ` A separate update notification was accepted for ${result.instructor.email} (HTTP ${emailResponse.status}); this does not confirm inbox delivery.`;
        } catch (cause) {
          actionNotice += ` The account was updated, but the notification could not be sent: ${cause.message || "EmailJS error."}`;
        }
      }
      setNotice(actionNotice);
      setEditingInstructor(null);
      setEditForm({ name: "", instructorId: "", newPassword: "" });
      await load();
    } catch (cause) {
      setError(cause.message || "Unable to update this instructor.");
    } finally {
      setBusyUid("");
    }
  };

  if (loading) {
    return (
      <section className="admin-page">
        <div className="admin-loading">
          <div className="admin-loading-spinner" aria-hidden="true" />
          <p>Loading instructor requests…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-stat-row">
        <article className="admin-stat">
          <span>Pending requests</span>
          <strong>{counts.pending}</strong>
        </article>
        <article className="admin-stat">
          <span>Active instructors</span>
          <strong>{counts.active}</strong>
        </article>
        <article className="admin-stat">
          <span>Blocked accounts</span>
          <strong>{counts.blocked}</strong>
        </article>
      </div>

      {error && <p className="admin-banner admin-banner-error" role="alert">{error}</p>}
      {notice && <p className="admin-banner admin-banner-ok" role="status">{notice}</p>}

      <div className="admin-card admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Pending requests</h2>
            <p>New access requests are loaded from the live database.</p>
          </div>
          <button type="button" className="admin-refresh" onClick={load} disabled={Boolean(busyUid)}>
            Refresh
          </button>
        </div>

        {pending.length === 0 ? (
          <div className="admin-empty compact">
            <div className="admin-empty-mark" aria-hidden="true">IN</div>
            <h2>No instructor requests yet</h2>
            <p>Requests will appear here after they are submitted successfully.</p>
          </div>
        ) : (
          <ul className="admin-people-list">
            {pending.map((person) => (
              <li key={person.uid} className="admin-person-row">
                <div className="admin-person-main">
                  <span className="admin-person-avatar" aria-hidden="true">
                    {(person.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>{person.name}</b>
                    <small>{person.email}</small>
                    <small>Requested: {formatBlocks(person.assignedBlocks)}</small>
                    <small>Submitted {formatWhen(person.createdAt)}</small>
                  </div>
                </div>
                <div className="admin-person-actions">
                  <button
                    type="button"
                    className="admin-action-approve"
                    disabled={busyUid === person.uid}
                    onClick={() => runAction(person.uid, () => approveInstructor(person.uid), "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="admin-action-reject"
                    disabled={busyUid === person.uid}
                    onClick={() => {
                      const reason = window.prompt("Optional rejection reason:", "");
                      if (reason !== null) {
                        void runAction(person.uid, () => rejectInstructor(person.uid, reason), "rejected");
                      }
                    }}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="admin-action-reject"
                    disabled={Boolean(busyUid)}
                    onClick={() => removeInstructor(person)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Instructor roster</h2>
            <p>Approved and previously reviewed instructor accounts.</p>
          </div>
        </div>
        {roster.length === 0 ? (
          <div className="admin-empty compact">
            <div className="admin-empty-mark" aria-hidden="true">RO</div>
            <h2>No instructors yet</h2>
            <p>Reviewed accounts will appear here.</p>
          </div>
        ) : (
          <ul className="admin-people-list">
            {roster.map((person) => (
              <li key={person.uid} className="admin-person-row">
                <div className="admin-person-main">
                  <span className="admin-person-avatar" aria-hidden="true">
                    {(person.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>
                      {person.name}{" "}
                      <em className={`admin-status admin-status-${person.status}`}>{person.status}</em>
                    </b>
                    <small>Instructor ID: {person.instructorId || "Assigned on approval"}</small>
                    <small>{person.email}</small>
                    <small>{formatBlocks(person.assignedBlocks)}</small>
                    {person.rejectionReason && <small>Reason: {person.rejectionReason}</small>}
                  </div>
                </div>
                <div className="admin-person-actions">
                  <button
                    type="button"
                    className="admin-refresh"
                    disabled={Boolean(busyUid)}
                    onClick={() => beginEdit(person)}
                  >
                    Edit
                  </button>
                  {person.status === "active" && (
                    <button
                      type="button"
                      className="admin-action-reject"
                      disabled={busyUid === person.uid}
                      onClick={() => runAction(person.uid, () => suspendInstructor(person.uid))}
                    >
                      Suspend
                    </button>
                  )}
                  {(person.status === "suspended" || person.status === "rejected") && (
                    <button
                      type="button"
                      className="admin-action-approve"
                      disabled={busyUid === person.uid}
                      onClick={() => runAction(person.uid, () => approveInstructor(person.uid), "approved")}
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-action-reject"
                    disabled={Boolean(busyUid)}
                    onClick={() => removeInstructor(person)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editingInstructor && (
        <div className="admin-modal-backdrop" role="presentation">
          <form className="admin-card admin-instructor-edit" onSubmit={saveInstructor}>
            <div className="admin-section-head">
              <div>
                <h2>Edit instructor</h2>
                <p>Changes will be saved. If any details change, a separate notification will be emailed to this instructor.</p>
              </div>
              <button
                type="button"
                className="admin-refresh"
                disabled={Boolean(busyUid)}
                onClick={() => setEditingInstructor(null)}
              >
                Close
              </button>
            </div>
            <label>
              Name
              <input
                required
                maxLength={255}
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </label>
            <label>
              Instructor ID
              <input
                required
                pattern="C-[0-9]{4}-[0-9]{3}"
                placeholder="C-2026-781"
                value={editForm.instructorId}
                onChange={(event) => setEditForm({ ...editForm, instructorId: event.target.value })}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Leave blank to keep the current password"
                value={editForm.newPassword}
                onChange={(event) => setEditForm({ ...editForm, newPassword: event.target.value })}
              />
            </label>
            <small className="admin-instructor-edit-note">For security, the password is hashed and never included in the email. Let the instructor know their new password through a secure channel.</small>
            <div className="admin-person-actions">
              <button type="button" className="admin-refresh" disabled={Boolean(busyUid)} onClick={() => setEditingInstructor(null)}>Cancel</button>
              <button type="submit" className="admin-action-approve" disabled={Boolean(busyUid)}>
                {busyUid ? "Saving…" : "Save and notify"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
