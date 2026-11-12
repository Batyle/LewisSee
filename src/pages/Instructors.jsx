export default function Instructors() {
  return (
    <section className="admin-page">
      <div className="admin-stat-row" aria-hidden="true">
        <article className="admin-stat">
          <span>Pending requests</span>
          <strong>—</strong>
        </article>
        <article className="admin-stat">
          <span>Active instructors</span>
          <strong>—</strong>
        </article>
        <article className="admin-stat">
          <span>Blocked accounts</span>
          <strong>—</strong>
        </article>
      </div>

      <div className="admin-card admin-empty">
        <div className="admin-empty-mark" aria-hidden="true">
          IN
        </div>
        <h2>Instructor management coming next</h2>
        <p>
          Approve classroom access, review pending sign-ups, and keep the instructor
          roster in sync from this panel.
        </p>
      </div>
    </section>
  );
}
