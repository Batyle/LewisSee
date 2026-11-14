import bcrypt from 'bcrypt';
import 'dotenv/config';

const accounts = [
  { table: 'admins', name: 'Administrator', email: 'admin', password: 'admin123' },
  { table: 'instructors', name: 'Employee', email: 'employee', password: 'employee123' },
];

if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_ACCOUNTS !== 'true') {
  console.error('Test account seeding is disabled. Set ENABLE_TEST_ACCOUNTS=true in a non-production environment to enable it.');
  process.exitCode = 1;
} else {
  const { default: pool } = await import('./db.js');
  try {
    for (const account of accounts) {
      const passwordHash = await bcrypt.hash(account.password, 12);
      if (account.table === 'admins') {
        await pool.execute(
          `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
          [account.name, account.email, passwordHash],
        );
      } else {
        await pool.execute(
          `INSERT INTO instructors (name, email, password_hash, status, email_verified, requested_blocks)
           VALUES (?, ?, ?, 'active', 1, JSON_ARRAY())
           ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), status = 'active', email_verified = 1`,
          [account.name, account.email, passwordHash],
        );
      }
    }
    console.log('Test accounts are ready.');
  } catch (error) {
    console.error('Could not seed test accounts:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
