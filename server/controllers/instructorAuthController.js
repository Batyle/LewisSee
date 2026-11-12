import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(req, res, next) {
  const { name, email, password, requestedBlockIds } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const validBlockIds = Array.isArray(requestedBlockIds)
    && requestedBlockIds.every((id) => Number.isInteger(id) && id > 0);

  if (typeof name !== 'string' || !name.trim() || !emailPattern.test(normalizedEmail)
    || typeof password !== 'string' || password.length < 8 || !validBlockIds) {
    return res.status(400).json({ message: 'Please provide a name, valid email, password of at least 8 characters, and valid requested block IDs.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO instructors (name, email, password_hash, status, email_verified, requested_blocks)
       VALUES (?, ?, ?, 'pending', 0, ?)`,
      [name.trim(), normalizedEmail, passwordHash, JSON.stringify(requestedBlockIds)],
    );
    // TODO Step 3: send "request received" email
    return res.status(201).json({
      instructor: { id: result.insertId, name: name.trim(), email: normalizedEmail, status: 'pending' },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with this email already exists.' });
    return next(error);
  }
}

export async function login(req, res, next) {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash, status, rejection_reason FROM instructors WHERE email = ?',
      [normalizedEmail],
    );
    const instructor = rows[0];
    if (!instructor || !(await bcrypt.compare(password, instructor.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (instructor.status === 'pending') return res.status(403).json({ message: 'Your account is awaiting admin approval.' });
    if (instructor.status === 'rejected') return res.status(403).json({ message: 'Your request was denied.', reason: instructor.rejection_reason });
    if (instructor.status === 'suspended') return res.status(403).json({ message: 'Your account is suspended.' });
    if (instructor.status === 'terminated') return res.status(403).json({ message: 'Your account has been terminated.' });

    const token = jwt.sign({ id: instructor.id, email: instructor.email, role: 'instructor' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, instructor: { id: instructor.id, name: instructor.name, email: instructor.email, status: instructor.status } });
  } catch (error) {
    return next(error);
  }
}
