import jwt from 'jsonwebtoken';

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication token is required.' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.ADMIN_JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('Invalid role');
    req.admin = { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}
