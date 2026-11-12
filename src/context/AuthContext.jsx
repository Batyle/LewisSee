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
    const restoreSession = async () => {
      if (!hasAdminSession()) {
        if (active) setLoading(false);
        return;
      }
      try {
        // The API checks the signed token and current MySQL admin role.
        const admin = await getCurrentAdmin();
        if (active) {
          setUser(admin);
          setIsAdmin(admin.role === "admin");
        }
      } catch (error) {
        clearAdminSession();
        if (active) setAuthError(error.message || "Your session has expired.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void restoreSession();
    return () => { active = false; };
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
