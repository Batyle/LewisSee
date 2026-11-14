import LewisSeeLogo from "./LewisSeeLogo";

export default function AccessShell({ kicker = "Facial attendance", copy, children }) {
  return (
    <main className="access-shell">
      <aside className="access-hero" aria-hidden="true">
        <div className="access-hero-glow" />
        <div className="access-hero-content">
          <p className="access-hero-kicker">{kicker}</p>
          <LewisSeeLogo className="access-hero-logo" />
          <p className="access-hero-brand"><span>Lewis</span><span>See</span></p>
          <p className="access-hero-copy">{copy}</p>
        </div>
        <div className="access-scan">
          <span className="access-scan-ring" />
          <span className="access-scan-ring access-scan-ring-delay" />
          <div className="access-scan-frame">
            <i />
            <i />
            <i />
            <i />
            <span className="access-scan-beam" />
          </div>
        </div>
      </aside>
      <section className="access-panel">
        <div className="access-panel-inner">{children}</div>
      </section>
    </main>
  );
}
