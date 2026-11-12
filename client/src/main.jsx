import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css'; import App from './App'; import { AuthProvider } from './context/AuthContext'; import { InstructorAuthProvider } from './context/InstructorAuthContext';
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><InstructorAuthProvider><App /></InstructorAuthProvider></AuthProvider></BrowserRouter>);
