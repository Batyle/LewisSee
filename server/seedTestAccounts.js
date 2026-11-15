import bcrypt from 'bcrypt';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function seedTestAccounts(pool) {
  const adminPasswordHash = await bcrypt.hash('admin123', 12);
  const employeePasswordHash = await bcrypt.hash('employee123', 12);

  await pool.execute(
    `INSERT INTO admins (uid, email, password_hash, role)
     VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin'`,
    [randomUUID(), 'admin@lewissee.local', adminPasswordHash],
  );
  await pool.execute(
    `INSERT INTO instructors
       (uid, name, email, password_hash, role, status, email_verified, assigned_blocks)
     VALUES (?, 'Employee', 'employee', ?, 'instructor', 'active', 1, JSON_ARRAY())
     ON DUPLICATE KEY UPDATE
       name = 'Employee', password_hash = VALUES(password_hash), role = 'instructor',
       status = 'active', email_verified = 1, assigned_blocks = JSON_ARRAY()`,
    [randomUUID(), employeePasswordHash],
  );
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_ACCOUNTS !== 'true') {
    console.error('Test account seeding is disabled. Set ENABLE_TEST_ACCOUNTS=true in a non-production environment to enable it.');
    process.exitCode = 1;
  } else {
    const { default: pool } = await import('./db.js');
    try {
      await seedTestAccounts(pool);
      console.log('Test accounts are ready.');
    } catch (error) {
      console.error('Could not seed test accounts:', error.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
