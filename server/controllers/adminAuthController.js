import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

export async function login(req, res, next) {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required.' });
  try {
    const [rows] = await pool.execute('SELECT id, name, email, password_hash FROM admins WHERE email = ?', [normalizedEmail]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) return res.status(401).json({ message: 'Invalid email or password.' });
    const token = jwt.sign({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' } });
  } catch (error) {
    return next(error);
  }
}

export function me(req, res) {
  res.json({ admin: req.admin });
}
