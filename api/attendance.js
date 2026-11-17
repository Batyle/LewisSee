import jwt from "jsonwebtoken";
import { ensureAttendanceSchema } from "./_lib/attendanceStore.js";
import { getPool } from "./_lib/database.js";
import { getDatabaseErrorMessage } from "./_lib/databaseErrorMessage.js";
import { loadAttendanceStore, replaceAttendanceStore } from "./_lib/attendanceStore.js";
import {
  getInstructorSessionClaims,
  refreshInstructorSession,
} from "./_lib/instructorSession.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
  maxDuration: 30,
};

const normalizeClassKey = (value) => {
  const item = value && typeof value === "object" ? value : {};
  return `${String(item.course || "").trim().toLowerCase()}|${String(item.yearLevel || "").trim()}|${String(item.block || "").trim().toLowerCase()}`;
};

async function authorizeStoreUpdate(req, res, pool) {
  const authorization = req.headers?.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Sign in before saving attendance data." });
    return false;
  }

  const token = authorization.slice(7);
  const adminSecret = process.env.ADMIN_JWT_SECRET;
  if (adminSecret) {
    let claims;
    try {
      claims = jwt.verify(token, adminSecret);
    } catch {
      claims = null;
    }
    if (claims?.sub && claims.role !== "instructor") {
      const [admins] = await pool.execute(
        "SELECT uid FROM admins WHERE uid = ? AND role = 'admin'",
        [claims.sub],
      );
      if (admins.length) return true;
    }
  }

  const claims = getInstructorSessionClaims(req);
  if (!claims || !await refreshInstructorSession(pool, claims.sub, claims.sid)) {
    res.status(401).json({ message: "Your instructor session is no longer active. Please sign in again." });
    return false;
  }

  await ensureAttendanceSchema(pool);
  const [rows] = await pool.query(
    "SELECT course, year_level AS yearLevel, block FROM class_groups",
  );
  const storedClasses = rows.map(normalizeClassKey).sort();
  const requestedClasses = (Array.isArray(req.body?.classes) ? req.body.classes : [])
    .map(normalizeClassKey)
    .sort();
  if (
    storedClasses.length !== requestedClasses.length ||
    storedClasses.some((classKey, index) => classKey !== requestedClasses[index])
  ) {
    res.status(403).json({ message: "Only an administrator can add, change, or remove courses and classes." });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  try {
    const pool = getPool();
    if (req.method === "GET") {
      const store = await loadAttendanceStore(pool);
      return res.status(200).json(store);
    }
    if (req.method === "PUT") {
      if (!await authorizeStoreUpdate(req, res, pool)) return;
      const result = await replaceAttendanceStore(pool, req.body);
      return res.status(200).json(result);
    }
    return res.status(405).json({ detail: "Method not allowed." });
  } catch (error) {
    if (error?.statusCode === 422) {
      return res.status(422).json({ detail: error.message });
    }
    console.error("Vercel attendance API request failed:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return res.status(503).json({
      detail: getDatabaseErrorMessage(error),
      message: getDatabaseErrorMessage(error),
    });
  }
}
