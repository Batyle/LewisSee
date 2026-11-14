import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";
import { listBlocks } from "./_lib/blocks.js";
import { getDatabaseErrorMessage } from "./_lib/databaseErrorMessage.js";
import { getPool } from "./_lib/database.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const respond = (res, code, body) => res.status(code).json(body);

const ADMIN_EMAILJS_SERVICE_ID = "service_42lrlwk";
const ADMIN_EMAILJS_TEMPLATE_ID = "template_cgf0ftr";
const ADMIN_EMAILJS_PUBLIC_KEY = "_OxeAtIVSYaPNqVhG";
const LIVE_SITE_ORIGIN = "https://lewis-see.vercel.app";

function resolveEmailJsOrigin(req) {
  const fromHeader = typeof req?.headers?.origin === "string" ? req.headers.origin.trim() : "";
  if (fromHeader.startsWith("https://")) return fromHeader;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").split(",")[0].trim();
  if (host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    const proto = String(req?.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
    return `${proto}://${host}`;
  }
  return process.env.EMAILJS_ORIGIN?.trim() || process.env.CLIENT_URL?.split(",")[0]?.trim() || LIVE_SITE_ORIGIN;
}

async function sendAdminEmailJs(templateParams, req) {
  const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: resolveEmailJsOrigin(req),
    },
    body: JSON.stringify({
      service_id: ADMIN_EMAILJS_SERVICE_ID,
      template_id: ADMIN_EMAILJS_TEMPLATE_ID,
      user_id: ADMIN_EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
    }),
  });
  if (!emailResponse.ok) {
    const detail = await emailResponse.text().catch(() => "");
    throw new Error(`EmailJS HTTP ${emailResponse.status}${detail ? `: ${detail}` : ""}`);
  }
  return true;
}

async function notifyInstructorDecision(instructor, decision, req) {
  if (!instructor?.email?.trim()) return false;
  const approved = decision === "approved";
  const suspended = decision === "suspended";
  const recipient = instructor.email.trim();
  const message = approved
    ? `Your instructor access request has been approved. Your instructor ID is ${instructor.instructorId || "being assigned"}. You can now sign in to LewisSee.`
    : suspended
      ? "Your LewisSee instructor account has been suspended. Please contact an administrator for assistance."
      : "Your instructor access request has been denied.";

  await sendAdminEmailJs({
    to_email: recipient,
    recipient_email: recipient,
    email: recipient,
    to_name: instructor.name,
    reply_to: recipient,
    instructor_name: instructor.name,
    decision,
    status: approved ? "active" : suspended ? "suspended" : "rejected",
    instructor_id: instructor.instructorId || "",
    password: approved ? "Use the password you set during registration" : "",
    message,
    reason: instructor.rejectionReason || "",
  }, req);
  return true;
}

async function notifyInstructorUpdate(instructor, changedFields, req, password = "") {
  if (!instructor?.email?.trim() || !changedFields?.length) return false;
  const recipient = instructor.email.trim();
  await sendAdminEmailJs({
    to_email: recipient,
    recipient_email: recipient,
    email: recipient,
    to_name: instructor.name,
    reply_to: recipient,
    instructor_name: instructor.name,
    instructor_id: instructor.instructorId || "",
    password: password || "Unchanged — use your existing password",
    decision: "updated",
    status: instructor.status,
    reason: "",
    changed_fields: changedFields.join(", "),
    message: `An administrator updated your instructor account: ${changedFields.join(", ")}. Contact your administrator if you did not expect this change.`,
  }, req);
  return true;
}

async function notifyAdminsOfInstructorRequest(pool, instructor, blocks, req) {
  try {
    const [admins] = await pool.execute(
      "SELECT email FROM admins WHERE role = 'admin' AND email <> ''",
    );
    if (!admins.length) {
      console.warn("EmailJS instructor request notice skipped: no administrator email addresses are configured.");
      return false;
    }

    const requestedBlocks = blocks
      .map((block) => `${block.course} Year ${block.yearLevel}, Block ${block.block}`)
      .join(", ") || "None selected";
    const results = await Promise.all(admins.map(async (admin) => {
      try {
        await sendAdminEmailJs({
          to_email: admin.email,
          recipient_email: admin.email,
          email: admin.email,
          to_name: "Administrator",
          instructor_name: instructor.name,
          instructor_email: instructor.email,
          decision: "pending",
          status: "pending",
          instructor_id: "",
          requested_blocks: requestedBlocks,
          reply_to: instructor.email,
          message: `${instructor.name} (${instructor.email}) submitted a new instructor access request. Requested blocks: ${requestedBlocks}. Review it in the LewisSee admin console.`,
        }, req);
        return true;
      } catch (error) {
        console.warn("EmailJS instructor request notice failed.", error?.message || error);
        return false;
      }
    }));

    return results.every(Boolean);
  } catch (error) {
    console.warn("EmailJS instructor request notice could not be sent.", error?.message || error);
    return false;
  }
}

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
    instructorId: row.instructor_id || "",
    name: row.name,
    email: row.email,
    status: row.status,
    assignedBlocks: parseBlocks(row.assigned_blocks),
    rejectionReason: row.rejection_reason || "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function ensureInstructorIdSchema(pool) {
  const [columns] = await pool.query("SHOW COLUMNS FROM instructors LIKE 'instructor_id'");
  if (!columns.length) {
    try {
      await pool.query("ALTER TABLE instructors ADD COLUMN instructor_id VARCHAR(12) NULL AFTER uid");
    } catch (error) {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }
  const [indexes] = await pool.query("SHOW INDEX FROM instructors WHERE Key_name = 'unique_instructor_id'");
  if (!indexes.length) {
    try {
      await pool.query("ALTER TABLE instructors ADD UNIQUE KEY unique_instructor_id (instructor_id)");
    } catch (error) {
      if (error.code !== "ER_DUP_KEYNAME") throw error;
    }
  }
}

async function assignInstructorId(pool, uid) {
  const [rows] = await pool.execute("SELECT instructor_id FROM instructors WHERE uid = ?", [uid]);
  if (!rows[0]) return "";
  if (rows[0].instructor_id) return rows[0].instructor_id;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const instructorId = `C-${new Date().getFullYear()}-${String(randomInt(1000)).padStart(3, "0")}`;
    try {
      const [result] = await pool.execute(
        "UPDATE instructors SET instructor_id = ? WHERE uid = ? AND instructor_id IS NULL",
        [instructorId, uid],
      );
      if (result.affectedRows) return instructorId;
      const [updated] = await pool.execute("SELECT instructor_id FROM instructors WHERE uid = ?", [uid]);
      return updated[0]?.instructor_id || "";
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
    }
  }
  throw new Error("Could not assign a unique instructor ID after several attempts.");
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
  await ensureInstructorIdSchema(pool);

  if (action === "me" && req.method === "GET") {
    return respond(res, 200, { admin: auth.admin });
  }

  if (action === "instructors" && path.length === 2 && req.method === "GET") {
    const [rows] = await pool.execute(
      `SELECT uid, instructor_id, name, email, status, assigned_blocks, rejection_reason, created_at
       FROM instructors
       ORDER BY CASE status
         WHEN 'pending' THEN 0
         WHEN 'active' THEN 1
         WHEN 'suspended' THEN 2
         WHEN 'rejected' THEN 3
         ELSE 4
       END, created_at DESC`,
    );
    for (const row of rows) {
      if (row.status !== "pending" && !row.instructor_id) {
        row.instructor_id = await assignInstructorId(pool, row.uid);
      }
    }
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

  if (action !== "instructors" || path.length !== 4) {
    return respond(res, 404, { message: "Route not found." });
  }

  const [, , uid, decision] = path;
  if (decision === "update" && req.method === "PUT") {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const instructorId = typeof body.instructorId === "string" ? body.instructorId.trim().toUpperCase() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!name || name.length > 255 || !/^C-\d{4}-\d{3}$/.test(instructorId)
      || (body.newPassword !== undefined && typeof body.newPassword !== "string")
      || (newPassword && (newPassword.length < 8 || newPassword.length > 128))) {
      return respond(res, 400, {
        message: "Provide a name, an instructor ID in C-YYYY-NNN format, and an optional password of 8–128 characters.",
      });
    }
    const [existing] = await pool.execute(
      "SELECT instructor_id, name FROM instructors WHERE uid = ?",
      [uid],
    );
    if (!existing.length) return respond(res, 404, { message: "Instructor was not found." });
    const [duplicate] = await pool.execute(
      "SELECT uid FROM instructors WHERE instructor_id = ? AND uid <> ?",
      [instructorId, uid],
    );
    if (duplicate.length) return respond(res, 409, { message: "That instructor ID is already in use." });

    const previous = existing[0];
    const changedFields = [];
    if (name !== String(previous.name || "").trim().replace(/\s+/g, " ")) changedFields.push("name");
    if (instructorId !== String(previous.instructor_id || "").toUpperCase()) changedFields.push("instructor ID");
    if (newPassword) changedFields.push("password");

    const values = [name, instructorId];
    let updateSql = "UPDATE instructors SET name = ?, instructor_id = ?";
    if (newPassword) {
      updateSql += ", password_hash = ?";
      values.push(await bcrypt.hash(newPassword, 12));
    }
    updateSql += " WHERE uid = ?";
    values.push(uid);
    try {
      await pool.execute(updateSql, values);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return respond(res, 409, { message: "That instructor ID is already in use." });
      }
      throw error;
    }
    const [updatedRows] = await pool.execute(
      `SELECT uid, instructor_id, name, email, status, assigned_blocks, rejection_reason, created_at
       FROM instructors WHERE uid = ?`,
      [uid],
    );
    const updatedInstructor = serializeInstructor(updatedRows[0]);

    let emailSent = false;
    let emailError = "";
    if (changedFields.length) {
      try {
        emailSent = await notifyInstructorUpdate(updatedInstructor, changedFields, req, newPassword);
      } catch (error) {
        emailError = error?.message || "EmailJS error.";
        console.warn("EmailJS instructor update notice failed.", emailError);
      }
    }
    return respond(res, 200, {
      instructor: updatedInstructor,
      message: "Instructor details updated.",
      emailSent,
      emailError,
    });
  }
  if (decision === "delete" && req.method === "DELETE") {
    const [result] = await pool.execute("DELETE FROM instructors WHERE uid = ?", [uid]);
    if (!result.affectedRows) return respond(res, 404, { message: "Instructor was not found." });
    return respond(res, 200, { message: "Instructor account deleted." });
  }
  if (req.method !== "POST") return respond(res, 404, { message: "Route not found." });

  const [matches] = await pool.execute(
    "SELECT uid, instructor_id, status FROM instructors WHERE uid = ?",
    [uid],
  );
  const instructor = matches[0];
  if (!instructor) return respond(res, 404, { message: "Instructor request was not found." });

  let update;
  let message;
  if (decision === "approve" && ["pending", "rejected", "suspended"].includes(instructor.status)) {
    await assignInstructorId(pool, uid);
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
    `SELECT uid, instructor_id, name, email, status, assigned_blocks, rejection_reason, created_at
     FROM instructors WHERE uid = ?`,
    [uid],
  );
  const updatedInstructor = serializeInstructor(updatedRows[0]);
  const emailDecision = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "suspended";
  let emailSent = false;
  let emailError = "";
  try {
    emailSent = await notifyInstructorDecision(updatedInstructor, emailDecision, req);
  } catch (error) {
    emailError = error?.message || "EmailJS error.";
    console.warn("EmailJS instructor decision notice failed.", emailError);
  }
  return respond(res, 200, { instructor: updatedInstructor, message, emailSent, emailError });
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

    const notificationSent = await notifyAdminsOfInstructorRequest(
      pool,
      { name, email },
      selected,
      req,
    );
    return respond(res, 201, {
      instructor: { id: uid, uid, name, email, status: "pending" },
      message: notificationSent
        ? "Request submitted — an administrator has been notified. You'll be notified once your request is reviewed."
        : "Request submitted, but we couldn't email the administrators. Your request is saved and visible in the admin console.",
      notificationSent,
    });
  }

  if (action === "login" && req.method === "POST") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return respond(res, 400, { message: "Email and password are required." });

    const [rows] = await pool.execute(
      `SELECT uid, instructor_id, name, email, password_hash, status, rejection_reason
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
        instructorId: instructor.instructor_id || "",
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
