export default function Notifications() {
  return (
    <section className="admin-page">
      <div className="admin-stat-row" aria-hidden="true">
        <article className="admin-stat">
          <span>Channel status</span>
          <strong>Offline</strong>
        </article>
        <article className="admin-stat">
          <span>Last delivery</span>
          <strong>—</strong>
        </article>
        <article className="admin-stat">
          <span>Queued alerts</span>
          <strong>0</strong>
        </article>
      </div>

      <div className="admin-card admin-empty">
        <div className="admin-empty-mark" aria-hidden="true">
          NT
        </div>
        <h2>No notification settings yet</h2>
        <p>
          Email and live alert preferences will land here so attendance updates can
          reach students and staff reliably.
        </p>
      </div>
    </section>
  );
}
