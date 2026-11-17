import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveInstructor,
  deleteInstructor,
  listInstructors,
  rejectInstructor,
  sendInstructorNotification,
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

const sortInstructors = (people, sortBy) => [...people].sort((a, b) => {
  if (sortBy.startsWith("name")) {
    const nameOrder = (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    return sortBy === "name-desc" ? -nameOrder : nameOrder;
  }
  const dateA = new Date(a.createdAt || 0).getTime();
  const dateB = new Date(b.createdAt || 0).getTime();
  const dateOrder = (Number.isNaN(dateA) ? 0 : dateA) - (Number.isNaN(dateB) ? 0 : dateB);
  return sortBy === "date-asc" ? dateOrder : -dateOrder;
});

const getEmailFailure = (serverError, clientError) => {
  const browserError = clientError?.text
    ? `EmailJS HTTP ${clientError.status}: ${clientError.text}`
    : clientError?.message;
  const details = [serverError, browserError].filter((value, index, errors) =>
    value && errors.indexOf(value) === index);
  return details.join(" | ") || "EmailJS error.";
};

export default function Instructors() {
  const [instructors, setInstructors] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, active: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyUid, setBusyUid] = useState("");
  const [bulkAction, setBulkAction] = useState("");
  const [editingInstructor, setEditingInstructor] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", instructorId: "", newPassword: "" });
  const [requestSort, setRequestSort] = useState("date-desc");
  const [rosterStatus, setRosterStatus] = useState("all");
  const [rosterSort, setRosterSort] = useState("date-desc");
  const loadSequence = useRef(0);

  const applyInstructorList = useCallback((data) => {
    setInstructors(data.instructors || []);
    setCounts({
      pending: data.counts?.pending ?? 0,
      active: data.counts?.active ?? 0,
      blocked: data.counts?.blocked ?? 0,
    });
  }, []);

  const load = useCallback(async ({ reportError = true } = {}) => {
    const sequence = ++loadSequence.current;
    try {
      const data = await listInstructors();
      if (sequence !== loadSequence.current) return sequence;
      if (reportError) setError("");
      applyInstructorList(data);
    } catch (cause) {
      if (sequence !== loadSequence.current) return sequence;
      if (reportError) setError(cause.message || "Unable to load instructor requests.");
    }
    return sequence;
  }, [applyInstructorList]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void load({ reportError: false }).then((sequence) => {
          if (sequence === loadSequence.current) setLoading(false);
        });
      }
    };
    const sequence = ++loadSequence.current;
    listInstructors()
      .then((data) => {
        if (sequence !== loadSequence.current) return;
        setError("");
        applyInstructorList(data);
      })
      .catch((cause) => {
        if (sequence === loadSequence.current) {
          setError(cause.message || "Unable to load instructor requests.");
        }
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false);
      });
    const intervalId = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      loadSequence.current += 1;
    };
  }, [applyInstructorList, load]);

  const pending = useMemo(
    () => sortInstructors(instructors.filter((person) => person.status === "pending"), requestSort),
    [instructors, requestSort],
  );
  const roster = useMemo(
    () => sortInstructors(
      instructors.filter((person) => person.status !== "pending"
        && (rosterStatus === "all" || person.status === rosterStatus)),
      rosterSort,
    ),
    [instructors, rosterSort, rosterStatus],
  );

  const runAction = async (uid, action, emailDecision) => {
    setBusyUid(uid);
    setError("");
    setNotice("");
    try {
      const result = await action();
      let actionNotice = result.message || "Instructor updated.";
      if (emailDecision && result.instructor?.email) {
        const recipient = result.emailRecipient || result.instructor.email;
        if (result.emailSent) {
          actionNotice += ` EmailJS accepted the notification request addressed to ${recipient}.`;
        } else {
          try {
            await sendInstructorDecisionEmail(result.instructor, emailDecision);
            actionNotice += ` EmailJS accepted the notification request addressed to ${result.instructor.email}.`;
          } catch (cause) {
            const emailError = getEmailFailure(result.emailError, cause);
            actionNotice += ` The account was updated, but the email could not be sent: ${emailError}`;
          }
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

  const runBulkAction = async ({ key, people, action, confirmation, label }) => {
    if (!people.length || busyUid || bulkAction || !window.confirm(confirmation)) return;

    setBulkAction(key);
    setError("");
    setNotice("");
    let updated = 0;
    let emailFailures = 0;
    const failures = [];

    for (const person of people) {
      try {
        const result = await action(person.uid);
        updated += 1;
        if (result.emailSent === false && result.instructor?.email) {
          try {
            const decision = key === "accept" || key === "reactivate"
              ? "approved"
              : key === "reject"
                ? "rejected"
                : "suspended";
            await sendInstructorDecisionEmail(result.instructor, decision);
          } catch {
            emailFailures += 1;
          }
        } else if (result.emailSent === false) {
          emailFailures += 1;
        }
      } catch (cause) {
        failures.push(`${person.name}: ${cause.message || "Update failed"}`);
      }
    }

    const summary = `${label}: updated ${updated} of ${people.length}.`;
    const emailNotice = emailFailures
      ? ` Email notification failed for ${emailFailures} account${emailFailures === 1 ? "" : "s"}.`
      : "";
    if (failures.length) {
      setError(`${summary}${emailNotice} Failed: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? `; and ${failures.length - 5} more` : ""}`);
    } else {
      setNotice(`${summary}${emailNotice}`);
    }

    await load({ reportError: false });
    setBulkAction("");
  };

  const removeInstructor = (person) => {
    const confirmed = window.confirm(
      `Permanently delete ${person.name} (${person.email})? This cannot be undone and may remove linked records.`,
    );
    if (confirmed) void runAction(person.uid, () => deleteInstructor(person.uid));
  };

  const resendInstructorEmail = async (person) => {
    setBusyUid(person.uid);
    setError("");
    setNotice("");
    try {
      const result = await sendInstructorNotification(person.uid);
      setNotice(result.emailRecipient
        ? `${result.message} Intended recipient: ${result.emailRecipient}. If it arrives elsewhere, correct the EmailJS template's To Email setting to {{to_email}}.`
        : result.message);
    } catch (cause) {
      setError(cause.message || "EmailJS could not send the instructor notification.");
    } finally {
      setBusyUid("");
    }
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
      if (changedFields.length && result.instructor?.email) {
        if (result.emailSent) {
          actionNotice += ` EmailJS accepted the notification request for ${result.instructor.email}.`;
        } else {
          try {
            await sendInstructorUpdateEmail(result.instructor, changedFields);
            actionNotice += ` EmailJS accepted the notification request for ${result.instructor.email}.`;
          } catch (cause) {
            actionNotice += ` The account was updated, but the email could not be sent: ${getEmailFailure(result.emailError, cause)}`;
          }
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
          <div className="admin-section-controls">
            <label className="admin-filter-label">
              Sort requests
              <select
                className="admin-filter-select"
                value={requestSort}
                onChange={(event) => setRequestSort(event.target.value)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
              </select>
            </label>
            <button
              type="button"
              className="admin-action-approve"
              disabled={Boolean(busyUid || bulkAction || pending.length === 0)}
              onClick={() => void runBulkAction({
                key: "accept",
                people: pending,
                action: approveInstructor,
                label: "Accept all pending requests",
                confirmation: `Accept all ${pending.length} pending instructor request${pending.length === 1 ? "" : "s"}? Each instructor will be notified.`,
              })}
            >
              {bulkAction === "accept" ? "Accepting…" : `Accept all pending (${pending.length})`}
            </button>
            <button
              type="button"
              className="admin-action-reject"
              disabled={Boolean(busyUid || bulkAction || pending.length === 0)}
              onClick={() => {
                const reason = window.prompt("Optional rejection reason for all pending requests:", "");
                if (reason !== null) {
                  void runBulkAction({
                    key: "reject",
                    people: pending,
                    action: (uid) => rejectInstructor(uid, reason),
                    label: "Reject all pending requests",
                    confirmation: `Reject all ${pending.length} pending instructor request${pending.length === 1 ? "" : "s"}? Each instructor will be notified.`,
                  });
                }
              }}
            >
              {bulkAction === "reject" ? "Rejecting…" : `Reject all pending (${pending.length})`}
            </button>
            <button
              type="button"
              className="admin-refresh"
              onClick={() => {
                setLoading(true);
                void load().then((sequence) => {
                  if (sequence === loadSequence.current) setLoading(false);
                });
              }}
              disabled={Boolean(busyUid || bulkAction)}
            >
              Refresh
            </button>
          </div>
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
                    className="admin-refresh"
                    disabled={Boolean(busyUid || bulkAction)}
                    onClick={() => resendInstructorEmail(person)}
                  >
                    {busyUid === person.uid ? "Sending…" : "Resend email"}
                  </button>
                  <button
                    type="button"
                    className="admin-action-approve"
                    disabled={Boolean(busyUid || bulkAction)}
                    onClick={() => runAction(person.uid, () => approveInstructor(person.uid), "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="admin-action-reject"
                    disabled={Boolean(busyUid || bulkAction)}
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
                    disabled={Boolean(busyUid || bulkAction)}
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
            <p>Filter accepted, suspended, or rejected accounts; sort by request date or name.</p>
          </div>
          <div className="admin-section-controls">
            <label className="admin-filter-label">
              Status
              <select
                className="admin-filter-select"
                value={rosterStatus}
                onChange={(event) => setRosterStatus(event.target.value)}
              >
                <option value="all">All reviewed</option>
                <option value="active">Accepted</option>
                <option value="suspended">Suspended</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="admin-filter-label">
              Sort by
              <select
                className="admin-filter-select"
                value={rosterSort}
                onChange={(event) => setRosterSort(event.target.value)}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
              </select>
            </label>
            <button
              type="button"
              className="admin-action-reject"
              disabled={Boolean(busyUid || bulkAction || !instructors.some((person) => person.status === "active"))}
              onClick={() => {
                const activeInstructors = instructors.filter((person) => person.status === "active");
                void runBulkAction({
                  key: "suspend",
                  people: activeInstructors,
                  action: suspendInstructor,
                  label: "Suspend all active instructors",
                  confirmation: `Suspend all ${activeInstructors.length} active instructor${activeInstructors.length === 1 ? "" : "s"}? Each instructor will be notified and signed-in sessions will be blocked.`,
                });
              }}
            >
              {bulkAction === "suspend" ? "Suspending…" : "Suspend all active"}
            </button>
            <button
              type="button"
              className="admin-action-approve"
              disabled={Boolean(busyUid || bulkAction || !instructors.some((person) => ["suspended", "rejected"].includes(person.status)))}
              onClick={() => {
                const restorableInstructors = instructors.filter((person) => ["suspended", "rejected"].includes(person.status));
                void runBulkAction({
                  key: "reactivate",
                  people: restorableInstructors,
                  action: approveInstructor,
                  label: "Reactivate all suspended and rejected instructors",
                  confirmation: `Reactivate all ${restorableInstructors.length} suspended or rejected instructor account${restorableInstructors.length === 1 ? "" : "s"}? Each instructor will be notified.`,
                });
              }}
            >
              {bulkAction === "reactivate" ? "Reactivating…" : "Reactivate all"}
            </button>
          </div>
        </div>
        {roster.length === 0 ? (
          <div className="admin-empty compact">
            <div className="admin-empty-mark" aria-hidden="true">RO</div>
            <h2>No matching instructors</h2>
            <p>Try a different status filter or check back after requests are reviewed.</p>
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
                    disabled={Boolean(busyUid || bulkAction)}
                    onClick={() => beginEdit(person)}
                  >
                    Edit
                  </button>
                  {person.status === "active" && (
                    <button
                      type="button"
                      className="admin-action-reject"
                      disabled={Boolean(busyUid || bulkAction)}
                      onClick={() => runAction(person.uid, () => suspendInstructor(person.uid), "suspended")}
                    >
                      Suspend
                    </button>
                  )}
                  {(person.status === "suspended" || person.status === "rejected") && (
                    <button
                      type="button"
                      className="admin-action-approve"
                      disabled={Boolean(busyUid || bulkAction)}
                      onClick={() => runAction(person.uid, () => approveInstructor(person.uid), "approved")}
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-action-reject"
                    disabled={Boolean(busyUid || bulkAction)}
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
                disabled={Boolean(busyUid || bulkAction)}
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
                pattern="[^0-9]+"
                title="Names cannot contain numbers."
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </label>
            <label>
              Instructor ID
              <input
                required
                pattern="C-[0-9]{4}-[0-9]{4}"
                placeholder="C-2026-0781"
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
            <small className="admin-instructor-edit-note">For security, passwords are never included in notification emails.</small>
            <div className="admin-person-actions">
              <button type="button" className="admin-refresh" disabled={Boolean(busyUid || bulkAction)} onClick={() => setEditingInstructor(null)}>Cancel</button>
              <button type="submit" className="admin-action-approve" disabled={Boolean(busyUid || bulkAction)}>
                {busyUid ? "Saving…" : "Save and notify"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
