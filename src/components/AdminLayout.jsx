import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LewisSeeLogo from "./LewisSeeLogo";

const navigation = [
  { to: "/dashboard", label: "Dashboard", hint: "Live attendance" },
  { to: "/instructors", label: "Instructors", hint: "Access & roster" },
  { to: "/notifications", label: "Notifications", hint: "Alerts & delivery" },
];

const pageMeta = {
  "/dashboard": { title: "Dashboard", copy: "Monitor live check-in and classroom attendance." },
  "/instructors": { title: "Instructors", copy: "Review instructor requests and manage classroom access." },
  "/notifications": { title: "Notifications", copy: "Configure how attendance alerts are delivered." },
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const identity = user?.email || user?.username || "Administrator";
  const initial = String(identity).trim().charAt(0).toUpperCase() || "A";
  const meta = pageMeta[location.pathname] || pageMeta["/dashboard"];
  const isDashboard = location.pathname === "/dashboard";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <LewisSeeLogo className="admin-brand-mark" />
          <div>
            <p className="admin-brand-name">LewisSee</p>
            <p className="admin-brand-sub">Admin console</p>
          </div>
        </div>

        <p className="admin-nav-label">Workspace</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "active" : undefined)}
              end={item.to === "/dashboard"}
            >
              <span className="admin-nav-text">
                <span className="admin-nav-title">{item.label}</span>
                <span className="admin-nav-hint">{item.hint}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <p>Facial attendance control for classroom sessions.</p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-top">
          <div className="admin-top-copy">
            <p className="admin-eyebrow">Admin console</p>
            <p className="admin-top-title">{meta.title}</p>
            <p className="admin-top-desc">{meta.copy}</p>
          </div>
          <div className="admin-top-actions">
            <div className="admin-user-chip" title={identity}>
              <span className="admin-user-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="admin-user">
                <strong>{identity}</strong>
                <small>Administrator</small>
              </span>
            </div>
            <button
              type="button"
              className="admin-logout"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
            >
              Log out
            </button>
          </div>
        </header>
        <main className={`admin-content${isDashboard ? " admin-content-workspace" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
