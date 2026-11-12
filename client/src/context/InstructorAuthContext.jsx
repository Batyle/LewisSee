import { createContext, useContext, useMemo, useState } from 'react';
const InstructorAuthContext = createContext(null);
export function InstructorAuthProvider({ children }) {
  const [instructor, setInstructor] = useState(() => { const saved = localStorage.getItem('instructor'); return saved ? JSON.parse(saved) : null; });
  const value = useMemo(() => ({ instructor, setSession(token, account) { localStorage.setItem('instructor_token', token); localStorage.setItem('instructor', JSON.stringify(account)); setInstructor(account); }, logout() { localStorage.removeItem('instructor_token'); localStorage.removeItem('instructor'); setInstructor(null); } }), [instructor]);
  return <InstructorAuthContext.Provider value={value}>{children}</InstructorAuthContext.Provider>;
}
export function useInstructorAuth() { const context = useContext(InstructorAuthContext); if (!context) throw new Error('useInstructorAuth must be used within InstructorAuthProvider'); return context; }
