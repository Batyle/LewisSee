import jwt from "jsonwebtoken";

const SESSION_LEASE_MINUTES = 2;

export async function ensureInstructorSessionsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instructor_sessions (
      instructor_uid VARCHAR(64) NOT NULL PRIMARY KEY,
      session_id CHAR(36) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY sessions_by_expiry (expires_at)
    ) CHARACTER SET utf8mb4
  `);
}

export async function acquireInstructorSession(pool, instructorUid, sessionId) {
  await ensureInstructorSessionsSchema(pool);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [instructors] = await connection.execute(
      "SELECT uid FROM instructors WHERE uid = ? FOR UPDATE",
      [instructorUid],
    );
    if (!instructors.length) {
      await connection.rollback();
      return false;
    }

    const [sessions] = await connection.execute(
      `SELECT session_id, expires_at > UTC_TIMESTAMP(3) AS is_active
       FROM instructor_sessions WHERE instructor_uid = ? FOR UPDATE`,
      [instructorUid],
    );
    if (sessions[0]?.is_active) {
      await connection.rollback();
      return false;
    }

    await connection.execute(
      `INSERT INTO instructor_sessions (instructor_uid, session_id, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_LEASE_MINUTES} MINUTE))
       ON DUPLICATE KEY UPDATE
         session_id = VALUES(session_id),
         expires_at = VALUES(expires_at)`,
      [instructorUid, sessionId],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function refreshInstructorSession(pool, instructorUid, sessionId) {
  await ensureInstructorSessionsSchema(pool);
  const [result] = await pool.execute(
    `UPDATE instructor_sessions
     SET expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_LEASE_MINUTES} MINUTE)
     WHERE instructor_uid = ? AND session_id = ? AND expires_at > UTC_TIMESTAMP(3)`,
    [instructorUid, sessionId],
  );
  return result.affectedRows === 1;
}

export async function releaseInstructorSession(pool, instructorUid, sessionId) {
  await ensureInstructorSessionsSchema(pool);
  await pool.execute(
    "DELETE FROM instructor_sessions WHERE instructor_uid = ? AND session_id = ?",
    [instructorUid, sessionId],
  );
}

export function getInstructorSessionClaims(req) {
  const authorization = req.headers?.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;

  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret.length < 32) return null;
    const claims = jwt.verify(authorization.slice(7), secret);
    if (claims.role !== "instructor" || !claims.sub || !claims.sid) return null;
    return claims;
  } catch {
    return null;
  }
}
