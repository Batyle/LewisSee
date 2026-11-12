import bcrypt from 'bcrypt';
import 'dotenv/config';
import pool from './db.js';

const name = process.argv[2] || process.env.ADMIN_NAME;
const email = (process.argv[3] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.argv[4] || process.env.ADMIN_PASSWORD;

if (!name || !email || !password) {
  console.error('Usage: npm run seed:admin -- "Admin Name" admin@example.com password');
  process.exit(1);
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
    [name.trim(), email, passwordHash],
  );
  console.log(`Admin created with id ${result.insertId}.`);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') console.error('An admin with that email already exists.');
  else console.error('Could not seed admin:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
