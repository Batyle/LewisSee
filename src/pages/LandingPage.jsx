import { Link } from "react-router-dom";
import LewisSeeLogo from "../components/LewisSeeLogo";
import faceRecognitionHero from "../assets/face-recognition-hero.png";
import "./LandingPage.css";

const features = [
  {
    icon: "face",
    title: "Face recognition",
    copy: "Recognize enrolled students from the classroom attendance workspace, without passing around a paper roll.",
  },
  {
    icon: "shield",
    title: "Liveness checks",
    copy: "A liveness check helps distinguish a live camera view from a still image before attendance is recorded.",
  },
  {
    icon: "records",
    title: "Clear attendance records",
    copy: "Review attendance by class and date, search past records, and make corrections when needed.",
  },
  {
    icon: "people",
    title: "One place to manage access",
    copy: "Administrators can review instructor requests and manage instructor accounts from the admin console.",
  },
];

const steps = [
  {
    number: "01",
    title: "Open your workspace",
    copy: "Instructors sign in to start a classroom session. Administrators are taken to the management dashboard.",
  },
  {
    number: "02",
    title: "Choose the class",
    copy: "Select the course, year, and block so attendance is recorded against the right group.",
  },
  {
    number: "03",
    title: "Verify and record",
    copy: "The camera checks for an enrolled face and runs a liveness check before adding a valid attendance record.",
  },
];

function FeatureIcon({ name }) {
  const paths = {
    face: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" />
        <circle cx="12" cy="10" r="3" />
        <path d="M7.5 19a4.5 4.5 0 0 1 9 0" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    records: (
      <>
        <path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
        <path d="M9 2h6v4H9zM7 11h10M7 15h7" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1a6 6 0 0 1 12 0v1Zm13-9a3 3 0 1 0-1-5.8M18 14a5 5 0 0 1 3 4.6v1.4" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-page" id="top">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="landing-brand" to="/" aria-label="LewisSee home">
            <LewisSeeLogo className="landing-brand-logo" />
            <span>Lewis<span>See</span></span>
          </Link>
          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#security">Security</a>
            <Link to="/about">Creators</Link>
          </nav>
          <Link className="landing-sign-in" to="/login">
            Sign in <ArrowIcon />
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow landing-hero-glow-one" aria-hidden="true" />
        <div className="landing-hero-glow landing-hero-glow-two" aria-hidden="true" />
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span className="landing-eyebrow-dot" />
              A clearer way to take attendance
            </p>
            <h1>
              Attendance
              <span>made simple.</span>
            </h1>
            <p className="landing-hero-description">
              LewisSee helps instructors record classroom attendance with face
              recognition and liveness checks, while giving administrators
              tools to manage classes and access.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button landing-button-primary" to="/login">
                Get started <ArrowIcon />
              </Link>
              <a className="landing-button landing-button-secondary" href="#how-it-works">
                See how it works
              </a>
            </div>
            <p className="landing-hero-note">
              For instructors and administrators at The Lewis College.
            </p>
          </div>

          <div className="landing-hero-visual">
            <div className="landing-visual-frame">
              <div className="landing-visual-topbar" aria-hidden="true">
                <span /><span /><span />
                <p>LewisSee <b>·</b> Face verification</p>
              </div>
              <div className="landing-visual-image">
                <img
                  src={faceRecognitionHero}
                  alt="Illustration of face recognition being used with a mobile device"
                />
                <div className="landing-scan-frame" aria-hidden="true">
                  <i /><i /><i /><i />
                  <span />
                </div>
                <div className="landing-image-caption">
                  <span className="landing-caption-dot" />
                  Face and liveness check
                </div>
              </div>
            </div>
            <div className="landing-float-card">
              <span className="landing-float-icon"><FeatureIcon name="records" /></span>
              <span><b>Class-aware records</b><small>Attendance in one workspace</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-overview" aria-label="System overview">
        <div className="landing-overview-inner">
          <div><b>Face recognition</b><span>Find enrolled students</span></div>
          <div><b>Liveness check</b><span>Verify a live camera view</span></div>
          <div><b>Attendance history</b><span>Review and manage records</span></div>
          <div><b>Admin controls</b><span>Manage instructor access</span></div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-heading">
          <p className="landing-section-kicker">MADE FOR THE CLASSROOM</p>
          <h2>Everything in one attendance workspace.</h2>
          <p>From starting a session to reviewing records, the tools you need stay connected.</p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article className="landing-feature-card" key={feature.title}>
              <span className="landing-feature-icon"><FeatureIcon name={feature.icon} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process" id="how-it-works">
        <div className="landing-process-inner">
          <div className="landing-process-heading">
            <p className="landing-section-kicker">HOW IT WORKS</p>
            <h2>Three steps to a recorded check-in.</h2>
            <p>Keep the process straightforward for instructors and students.</p>
            <Link className="landing-text-link" to="/login">
              Open LewisSee <ArrowIcon />
            </Link>
          </div>
          <div className="landing-step-list">
            {steps.map((step) => (
              <article className="landing-step" key={step.number}>
                <span>{step.number}</span>
                <div><h3>{step.title}</h3><p>{step.copy}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-security" id="security">
        <div className="landing-security-icon"><FeatureIcon name="shield" /></div>
        <div>
          <p className="landing-section-kicker">BUILT WITH CARE</p>
          <h2>Verification before an attendance record.</h2>
          <p>
            LewisSee checks for an enrolled student and a live camera view before
            recording attendance. Camera access is used in the attendance
            workspace; browser permission is required to start scanning.
          </p>
        </div>
        <Link className="landing-button landing-button-secondary" to="/login">
          Continue to sign in <ArrowIcon />
        </Link>
      </section>

      <section className="landing-cta">
        <div className="landing-cta-glow" aria-hidden="true" />
        <LewisSeeLogo className="landing-cta-logo" />
        <p className="landing-section-kicker">LEWISSEE ATTENDANCE</p>
        <h2>Ready to get started?</h2>
        <p>Sign in to open your instructor workspace or administrator dashboard.</p>
        <Link className="landing-button landing-button-primary" to="/login">
          Sign in to LewisSee <ArrowIcon />
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand" to="/" aria-label="LewisSee home">
          <LewisSeeLogo className="landing-brand-logo" />
          <span>Lewis<span>See</span></span>
        </Link>
        <p>© {new Date().getFullYear()} The Lewis College · Smart attendance system</p>
        <Link className="landing-about-link" to="/about">About the creators</Link>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
