import mysql from "mysql2/promise";

const poolKey = Symbol.for("lewissee.mysql.pool");

export function getPool() {
  if (!globalThis[poolKey]) {
    const required = ["DB_HOST", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD"];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
      throw new Error(`Missing server environment variables: ${missing.join(", ")}`);
    }

    const sslMode = (process.env.DB_SSL_MODE || "REQUIRED").toUpperCase();
    let ssl;
    if (sslMode === "REQUIRED") {
      ssl = { rejectUnauthorized: false };
    } else if (sslMode === "VERIFY_CA" || sslMode === "VERIFY_IDENTITY") {
      if (!process.env.DB_SSL_CA) throw new Error("DB_SSL_CA is required for verified TLS.");
      ssl = { ca: process.env.DB_SSL_CA, rejectUnauthorized: true };
    } else if (sslMode !== "DISABLED") {
      throw new Error("DB_SSL_MODE must be REQUIRED, VERIFY_CA, VERIFY_IDENTITY, or DISABLED.");
    }

    globalThis[poolKey] = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      charset: "utf8mb4",
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 4,
      connectTimeout: 5000,
      enableKeepAlive: true,
      ssl,
    });
  }

  return globalThis[poolKey];
}
