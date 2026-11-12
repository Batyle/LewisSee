import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const sslMode = (process.env.DB_SSL_MODE || '').toUpperCase();
const sslCa = (process.env.DB_SSL_CA || '').trim();

const ssl = (() => {
  if (!sslMode || sslMode === 'DISABLED') return undefined;
  const settings = {};
  if (sslCa) {
    const caPath = path.isAbsolute(sslCa) ? sslCa : path.join(root, sslCa);
    if (!fs.existsSync(caPath)) {
      throw new Error(`DB_SSL_CA file was not found: ${caPath}`);
    }
    settings.ca = fs.readFileSync(caPath);
  }
  if (sslMode === 'REQUIRED') {
    settings.rejectUnauthorized = Boolean(settings.ca);
  } else if (sslMode === 'VERIFY_CA' || sslMode === 'VERIFY_IDENTITY') {
    settings.rejectUnauthorized = true;
  }
  return settings;
})();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl,
});

export default pool;
