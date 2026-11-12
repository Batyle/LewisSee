import { createContext, useContext, useMemo, useState } from 'react';
import api from '../api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));
  const [admin, setAdmin] = useState(() => { const saved = localStorage.getItem('admin'); return saved ? JSON.parse(saved) : null; });
  const value = useMemo(() => ({ token, admin, async login(email, password) { const { data } = await api.post('/auth/login', { email, password }); localStorage.setItem('admin_token', data.token); localStorage.setItem('admin', JSON.stringify(data.admin)); setToken(data.token); setAdmin(data.admin); }, logout() { localStorage.removeItem('admin_token'); localStorage.removeItem('admin'); setToken(null); setAdmin(null); } }), [token, admin]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
