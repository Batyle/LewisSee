import { useEffect, useState } from "react";
import LewisSeeLogo from "./LewisSeeLogo";

const INTRO_KEY = "lewissee-intro-seen";
const INTRO_DURATION_MS = 4500;
const EXIT_DURATION_MS = 400;

export default function IntroAnimation() {
  const [visible, setVisible] = useState(
    () => !window.sessionStorage.getItem(INTRO_KEY),
  );
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const introTimer = window.setTimeout(
      () => setExiting(true),
      reducedMotion ? 900 : INTRO_DURATION_MS,
    );
    const exitTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(INTRO_KEY, "true");
      setVisible(false);
    }, (reducedMotion ? 900 : INTRO_DURATION_MS) + EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(introTimer);
      window.clearTimeout(exitTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`lewissee-intro${exiting ? " is-exiting" : ""}`}
      role="status"
      aria-label="Welcome to LewisSee"
      aria-live="polite"
    >
      <span className="lewissee-intro-glow" aria-hidden="true" />
      <div className="lewissee-intro-content">
        <LewisSeeLogo animated className="lewissee-intro-logo" />
        <p className="lewissee-intro-brand">
          <span>Lewis</span><span>See</span>
        </p>
        <p className="lewissee-intro-subtitle">SMART ATTENDANCE SYSTEM</p>
      </div>
    </div>
  );
}
