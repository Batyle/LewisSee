import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearAdminSession, getCurrentAdmin, hasAdminSession, signInAdmin } from "../api/adminApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    let restoring = false;
    let retryAttempt = 0;
    let retryTimer;
    const restoreSession = async () => {
      if (restoring) return;
      if (!hasAdminSession()) {
        if (active) setLoading(false);
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = undefined;
      restoring = true;
      try {
        // The API checks the signed token and current MySQL admin role.
        const admin = await getCurrentAdmin();
        if (active) {
          setUser(admin);
          setIsAdmin(admin.role === "admin");
          setAuthError("");
        }
        retryAttempt = 0;
      } catch (error) {
        const status = Number(error.status);
        const invalidSession = status === 401 || status === 403;
        if (invalidSession) {
          clearAdminSession();
        } else if (
          status === 0 || status === 408 || status === 429 || status >= 500 ||
          /reach|network|fetch|timeout|connection|temporar/i.test(error.message || "")
        ) {
          const delay = Math.min(30000, 1000 * (2 ** retryAttempt));
          retryAttempt += 1;
          retryTimer = setTimeout(() => void restoreSession(), delay);
        }
        if (active) setAuthError(error.message || "Your session has expired.");
      } finally {
        restoring = false;
        if (active) setLoading(false);
      }
    };
    void restoreSession();
    window.addEventListener("online", restoreSession);
    return () => {
      active = false;
      clearTimeout(retryTimer);
      window.removeEventListener("online", restoreSession);
    };
  }, []);

  const login = async (email, password) => {
    setAuthError("");
    const admin = await signInAdmin(email, password);
    if (admin.role !== "admin") {
      clearAdminSession();
      throw new Error("Access denied");
    }
    setUser(admin);
    setIsAdmin(true);
  };

  const logout = () => {
    clearAdminSession();
    setUser(null);
    setIsAdmin(false);
  };

  const value = useMemo(() => ({ user, isAdmin, loading, authError, login, logout }), [user, isAdmin, loading, authError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
