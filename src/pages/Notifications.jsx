import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getNotificationSettings, saveNotificationEmail } from "../api/adminApi";

const formatWhen = (value) => {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

export default function Notifications() {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const emailDraftChanged = useRef(false);

  const refresh = useCallback(async (isActive = () => true) => {
    const data = await getNotificationSettings();
    if (!isActive()) return;
    if (!emailDraftChanged.current) setRecipientEmail(data.recipientEmail || "");
    setPendingCount(data.pendingCount || 0);
    setPendingRequests(data.pendingRequests || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        await refresh(() => active);
        if (active) setError("");
      } catch (cause) {
        if (active) {
          setError(cause.message || "Unable to load notification settings.");
          setLoading(false);
        }
      }
    };

    void update();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void update();
    };
    const intervalId = window.setInterval(refreshWhenVisible, 20000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
    };
  }, [refresh]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await saveNotificationEmail(recipientEmail.trim());
      emailDraftChanged.current = false;
      setRecipientEmail(result.recipientEmail || "");
      setNotice(result.message || "Notification email saved.");
      await refresh();
    } catch (cause) {
      setError(cause.message || "Unable to save the notification email.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-page">
      <div className="admin-stat-row">
        <article className="admin-stat">
          <span>Admin email</span>
          <strong>{recipientEmail ? "Configured" : "Not configured"}</strong>
        </article>
        <article className="admin-stat">
          <span>Pending requests</span>
          <strong>{pendingCount}</strong>
        </article>
        <article className="admin-stat">
          <span>Request refresh</span>
          <strong>Every 20 sec</strong>
        </article>
      </div>

      <div className="admin-card notification-settings">
        <div className="admin-section-head">
          <div>
            <h2>Admin email alerts</h2>
            <p>New instructor access requests are emailed automatically to this address.</p>
          </div>
        </div>
        <form className="notification-settings-form" onSubmit={save}>
          <label htmlFor="admin-notification-email">Notification recipient</label>
          <div className="notification-settings-row">
            <input
              id="admin-notification-email"
              type="email"
              autoComplete="email"
              maxLength={255}
              required
              value={recipientEmail}
              onChange={(event) => {
                emailDraftChanged.current = true;
                setRecipientEmail(event.target.value);
              }}
              placeholder="admin@example.com"
            />
            <button type="submit" className="admin-action-approve" disabled={saving || loading}>
              {saving ? "Saving…" : "Save email"}
            </button>
          </div>
          <p>
            EmailJS sends from its connected sender. Verify that sender domain, set the template
            recipient to <code>{"{{to_email}}"}</code>, and remove the password section from the
            template; LewisSee never emails passwords.
          </p>
        </form>
        {error && <p className="alert error-alert" role="alert">{error}</p>}
        {notice && <p className="alert success-alert" role="status">{notice}</p>}
      </div>

      <div className="admin-card notification-requests">
        <div className="admin-section-head">
          <div>
            <h2>Instructor requests</h2>
            <p>Pending requests refresh automatically while this page is open.</p>
          </div>
          <Link className="admin-refresh" to="/instructors">Review requests</Link>
        </div>
        {loading ? (
          <p role="status">Loading requests…</p>
        ) : pendingRequests.length ? (
          <ul className="notification-request-list">
            {pendingRequests.map((request) => (
              <li key={request.uid}>
                <div>
                  <strong>{request.name}</strong>
                  <span>{request.email}</span>
                </div>
                <time dateTime={request.created_at}>{formatWhen(request.created_at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notification-no-requests">No pending instructor requests.</p>
        )}
      </div>
    </section>
  );
}
