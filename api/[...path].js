import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { listBlocks } from "./_lib/blocks.js";
import { getDatabaseErrorMessage } from "./_lib/databaseErrorMessage.js";
import { getPool } from "./_lib/database.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const respond = (res, code, body) => res.status(code).json(body);

function getPath(req) {
  const rawPath = req.query?.path ?? new URL(req.url, "http://localhost").pathname.replace(/^\/api\/?/, "");
  const segments = Array.isArray(rawPath) ? rawPath : String(rawPath).split("/");
  return segments.filter(Boolean).map((part) => decodeURIComponent(part));
}

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function getJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || "";
  if (secret.length < 32) throw new Error("ADMIN_JWT_SECRET must contain at least 32 characters.");
  return secret;
}

function parseBlocks(value) {
  if (typeof value !== "string") return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeInstructor(row) {
  return {
    uid: row.uid,
    name: row.name,
    email: row.email,
    status: row.status,
    assignedBlocks: parseBlocks(row.assigned_blocks),
    rejectionReason: row.rejection_reason || "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function requireAdmin(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!match) return { error: [401, "Authentication required."] };

  let claims;
  try {
    claims = jwt.verify(match[1], getJwtSecret(), { algorithms: ["HS256"] });
  } catch {
    return { error: [401, "Invalid or expired session."] };
  }

  if (!claims.sub) return { error: [401, "Invalid or expired session."] };
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT uid, email, role FROM admins WHERE uid = ?",
    [claims.sub],
  );
  const admin = rows[0];
  if (!admin || admin.role !== "admin") return { error: [403, "Access denied."] };
  return { admin };
}

async function handleAdmin(req, res, path, pool) {
  const action = path[1];
  const body = getBody(req);

  if (action === "login" && req.method === "POST") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return respond(res, 400, { message: "Email and password are required." });

    const [rows] = await pool.execute(
      "SELECT uid, email, password_hash, role FROM admins WHERE LOWER(email) = LOWER(?)",
      [email],
    );
    const admin = rows[0];
    if (!admin || !await bcrypt.compare(password, admin.password_hash) || admin.role !== "admin") {
      return respond(res, 401, { message: "Invalid email or password." });
    }

    const token = jwt.sign({ sub: admin.uid }, getJwtSecret(), { algorithm: "HS256", expiresIn: "8h" });
    return respond(res, 200, {
      token,
      admin: { uid: admin.uid, email: admin.email, role: admin.role },
    });
  }

  const auth = await requireAdmin(req);
  if (auth.error) return respond(res, auth.error[0], { message: auth.error[1] });

  if (action === "me" && req.method === "GET") {
    return respond(res, 200, { admin: auth.admin });
  }

  if (action === "instructors" && path.length === 2 && req.method === "GET") {
    const [rows] = await pool.execute(
      `SELECT uid, name, email, status, assigned_blocks, rejection_reason, created_at
       FROM instructors
       ORDER BY CASE status
         WHEN 'pending' THEN 0
         WHEN 'active' THEN 1
         WHEN 'suspended' THEN 2
         WHEN 'rejected' THEN 3
         ELSE 4
       END, created_at DESC`,
    );
    const instructors = rows.map(serializeInstructor);
    return respond(res, 200, {
      instructors,
      counts: {
        pending: instructors.filter((person) => person.status === "pending").length,
        active: instructors.filter((person) => person.status === "active").length,
        blocked: instructors.filter((person) => ["suspended", "terminated", "rejected"].includes(person.status)).length,
      },
    });
  }

  if (action !== "instructors" || path.length !== 4 || req.method !== "POST") {
    return respond(res, 404, { message: "Route not found." });
  }

  const [, , uid, decision] = path;
  const [matches] = await pool.execute(
    "SELECT uid, status FROM instructors WHERE uid = ?",
    [uid],
  );
  const instructor = matches[0];
  if (!instructor) return respond(res, 404, { message: "Instructor request was not found." });

  let update;
  let message;
  if (decision === "approve" && ["pending", "rejected", "suspended"].includes(instructor.status)) {
    update = "UPDATE instructors SET status = 'active', rejection_reason = NULL WHERE uid = ?";
    message = "Instructor approved.";
  } else if (decision === "reject" && ["pending", "active", "suspended"].includes(instructor.status)) {
    const reason = typeof body.reason === "string" ? body.reason.trim().replace(/\s+/g, " ").slice(0, 500) : "";
    update = "UPDATE instructors SET status = 'rejected', rejection_reason = ? WHERE uid = ?";
    await pool.execute(update, [reason || null, uid]);
    message = "Instructor request rejected.";
  } else if (decision === "suspend" && instructor.status === "active") {
    update = "UPDATE instructors SET status = 'suspended' WHERE uid = ?";
    message = "Instructor suspended.";
  } else {
    return respond(res, 400, { message: "This account cannot be updated with that action." });
  }

  if (decision !== "reject") await pool.execute(update, [uid]);
  const [updatedRows] = await pool.execute(
    `SELECT uid, name, email, status, assigned_blocks, rejection_reason, created_at
     FROM instructors WHERE uid = ?`,
    [uid],
  );
  return respond(res, 200, { instructor: serializeInstructor(updatedRows[0]), message });
}

async function handleInstructorAuth(req, res, action, pool) {
  const body = getBody(req);
  if (action === "register" && req.method === "POST") {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const requestedBlockIds = body.requestedBlockIds ?? [];
    if (!name || name.length > 255 || !emailPattern.test(email) || email.length > 255
      || password.length < 8 || password.length > 128
      || !Array.isArray(requestedBlockIds)
      || requestedBlockIds.some((id) => !Number.isInteger(id) || id < 1)) {
      return respond(res, 400, {
        message: "Please provide a name, valid email, password of 8–128 characters, and valid requested block IDs.",
      });
    }

    const blocks = await listBlocks(pool);
    const blocksById = new Map(blocks.map((block) => [block.id, block]));
    const selected = [];
    for (const id of requestedBlockIds) {
      const block = blocksById.get(id);
      if (!block) return respond(res, 400, { message: "Requested block IDs are invalid." });
      selected.push({ course: block.course, yearLevel: block.yearLevel, block: block.block });
    }

    const uid = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await pool.execute(
        `INSERT INTO instructors
           (uid, name, email, password_hash, role, status, email_verified, assigned_blocks)
         VALUES (?, ?, ?, ?, 'instructor', 'pending', 0, ?)`,
        [uid, name, email, passwordHash, JSON.stringify(selected)],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return respond(res, 409, { message: "An account with this email already exists." });
      }
      throw error;
    }

    return respond(res, 201, {
      instructor: { id: uid, uid, name, email, status: "pending" },
      message: "Request submitted — you'll be notified once an admin reviews it.",
    });
  }

  if (action === "login" && req.method === "POST") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return respond(res, 400, { message: "Email and password are required." });

    const [rows] = await pool.execute(
      `SELECT uid, name, email, password_hash, status, rejection_reason
       FROM instructors WHERE LOWER(email) = LOWER(?)`,
      [email],
    );
    const instructor = rows[0];
    if (!instructor || !instructor.password_hash || !await bcrypt.compare(password, instructor.password_hash)) {
      return respond(res, 401, { message: "Invalid email or password." });
    }
    if (instructor.status !== "active") {
      const messages = {
        pending: "Your account is awaiting admin approval.",
        rejected: `Your request was denied.${instructor.rejection_reason ? ` ${instructor.rejection_reason}` : ""}`,
        suspended: "Your account is suspended.",
        terminated: "Your account has been terminated.",
      };
      return respond(res, 403, { message: messages[instructor.status] || "Your account cannot sign in yet." });
    }

    const token = jwt.sign(
      { sub: instructor.uid, role: "instructor" },
      getJwtSecret(),
      { algorithm: "HS256", expiresIn: "8h" },
    );
    return respond(res, 200, {
      token,
      instructor: {
        id: instructor.uid,
        uid: instructor.uid,
        name: instructor.name,
        email: instructor.email,
        status: instructor.status,
      },
    });
  }

  return respond(res, 404, { message: "Route not found." });
}

export default async function handler(req, res) {
  let path;
  try {
    path = getPath(req);
  } catch {
    return respond(res, 400, { message: "Invalid request path." });
  }

  if (path[0] !== "admin" && path[0] !== "instructor-auth") {
    return respond(res, 404, { message: "Route not found." });
  }

  try {
    const pool = getPool();
    if (path[0] === "admin") return await handleAdmin(req, res, path, pool);
    if (path.length !== 2) return respond(res, 404, { message: "Route not found." });
    return await handleInstructorAuth(req, res, path[1], pool);
  } catch (error) {
    console.error("Vercel API request failed:", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    return respond(res, 503, { message: getDatabaseErrorMessage(error) });
  }
}
