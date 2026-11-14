import { Link } from "react-router-dom";
import LewisSeeLogo from "../components/LewisSeeLogo";
import austinPhoto from "../../assets/creators/austin-dominic-valladolid.png";
import luigePhoto from "../../assets/creators/luige-dela-torre-corrected.jpg";
import jeAnPhoto from "../../assets/creators/je-an-fombuena-corrected.jpg";
import "./LandingPage.css";
import "./AboutCreators.css";

const creators = [
  {
    name: "Austin Dominic Valladolid",
    role: "Data Analysis and Database Integration",
    image: austinPhoto,
    description:
      "Works with attendance data and the MySQL database to support reliable data storage and retrieval.",
  },
  {
    name: "Luige Dela Torre",
    role: "Frontend/Backend Integration",
    image: luigePhoto,
    description:
      "Connects the React frontend with backend services and helps bring the system's attendance workflows together.",
  },
  {
    name: "Je An Fombuena",
    role: "Frontend System Designer, UI, and Documentation",
    image: jeAnPhoto,
    description:
      "Contributes to the interface design and user experience, and documents the system and its workflows.",
  },
];

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.6 1.6-1.6h1.7V3.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.3v3.2h2.8V21h3.4Z" />
    </svg>
  );
}

function facebookSearchUrl(name) {
  return `https://www.facebook.com/search/top/?q=${encodeURIComponent(name)}`;
}

export default function AboutCreators() {
  return (
    <main className="landing-page about-creators-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="landing-brand" to="/" aria-label="LewisSee home">
            <LewisSeeLogo className="landing-brand-logo" />
            <span>Lewis<span>See</span></span>
          </Link>
          <nav className="landing-nav" aria-label="Main navigation">
            <Link to="/">Home</Link>
            <Link to="/#features">Features</Link>
            <Link to="/about" aria-current="page">Creators</Link>
          </nav>
          <Link className="landing-sign-in" to="/login">
            Sign in
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </header>

      <section className="about-creators-hero">
        <p className="landing-section-kicker">THE PEOPLE BEHIND LEWISSEE</p>
        <h1>Meet the creators.</h1>
        <p>
          Three contributors brought together system integration, database
          workflows, and thoughtful interface design to build LewisSee for The
          Lewis College.
        </p>
      </section>

      <section className="about-creators-content" aria-label="LewisSee creators">
        <div className="about-creators-grid">
          {creators.map((creator, index) => (
            <article className="creator-card" key={creator.name}>
              <div className="creator-card-photo">
                <img src={creator.image} alt={creator.name} />
                <span className="creator-card-number">0{index + 1}</span>
              </div>
              <div className="creator-card-copy">
                <p className="creator-card-kicker">GROUP 7 · THE LEWIS COLLEGE</p>
                <h2>{creator.name}</h2>
                <p className="creator-card-role">{creator.role}</p>
                <p className="creator-card-description">{creator.description}</p>
                <a
                  className="creator-facebook-link"
                  href={facebookSearchUrl(creator.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search Facebook for ${creator.name}`}
                >
                  <FacebookIcon />
                  Find on Facebook
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer about-creators-footer">
        <Link className="landing-brand" to="/" aria-label="LewisSee home">
          <LewisSeeLogo className="landing-brand-logo" />
          <span>Lewis<span>See</span></span>
        </Link>
        <p>© {new Date().getFullYear()} The Lewis College · Group 7</p>
        <Link to="/">Back to LewisSee</Link>
      </footer>
    </main>
  );
}
