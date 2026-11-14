import LewisSeeLogo from "./LewisSeeLogo";

export default function LoadingScreen({
  message = "Preparing your workspace…",
  steps = [],
  error = "",
  onRetry,
  onContinue,
}) {
  return (
    <main className="app-loading-screen">
      <section
        className="app-loading-card"
        role="status"
        aria-live="polite"
        aria-busy={!error}
      >
        <LewisSeeLogo className="app-loading-mark" />
        <p className="app-loading-kicker">LEWISSEE ATTENDANCE</p>
        <h1>Getting everything ready</h1>
        <p className="app-loading-message">{message}</p>
        <span className="app-loading-spinner" aria-hidden="true" />
        {steps.length > 0 && (
          <ul className="app-loading-steps">
            {steps.map(({ label, status }) => (
              <li className={`app-loading-step ${status}`} key={label}>
                <span aria-hidden="true">{status === "ready" ? "✓" : status === "error" ? "!" : ""}</span>
                {label}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="app-loading-error" role="alert">{error}</p>}
        {(onRetry || onContinue) && (
          <div className="app-loading-actions">
            {onRetry && <button type="button" onClick={onRetry}>Retry scanner</button>}
            {onContinue && <button type="button" className="app-loading-secondary" onClick={onContinue}>Continue anyway</button>}
          </div>
        )}
      </section>
    </main>
  );
}
