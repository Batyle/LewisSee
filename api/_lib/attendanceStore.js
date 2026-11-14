function parseClockToMinutes(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const match24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  const match12 = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(text);
  if (!match12) return null;
  let hours = Number(match12[1]);
  const minutes = Number(match12[2]);
  const meridiem = match12[3].toUpperCase();
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
  else hours = hours === 12 ? 12 : hours + 12;
  return hours * 60 + minutes;
}

function clockAtMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatTimeHhmm(value) {
  const minutes = parseClockToMinutes(value);
  return minutes == null ? null : clockAtMinutes(minutes);
}

function sessionTimeRanges(session) {
  const timeInStart = session.timeInStart || session.requiredTimeIn;
  const start = parseClockToMinutes(timeInStart);
  const isLegacy = !session.timeInEnd;
  const timeInEnd =
    session.timeInEnd ||
    (start == null ? "" : clockAtMinutes(start + Math.max(0, Number(session.gracePeriodMinutes) || 0)));
  const lateStart =
    session.lateStart ||
    (!isLegacy || parseClockToMinutes(timeInEnd) == null
      ? null
      : clockAtMinutes((parseClockToMinutes(timeInEnd) ?? start) + 1));
  const lateEnd =
    session.lateEnd ||
    (!isLegacy || start == null
      ? null
      : session.lateThresholdMinutes == null
        ? "23:59"
        : clockAtMinutes(start + Math.max(0, Number(session.lateThresholdMinutes) || 0)));
  return { timeInStart, timeInEnd, lateStart, lateEnd };
}

function determineAttendanceStatus(currentScanTime, timeInStart, timeInEnd, lateStart = null, lateEnd = null) {
  const scan = parseClockToMinutes(currentScanTime);
  const start = parseClockToMinutes(timeInStart);
  const end = parseClockToMinutes(timeInEnd);
  if (scan == null || start == null || end == null || end <= start) {
    throw new Error("Current scan time and time-in start/end must be valid.");
  }
  if (scan >= start && scan <= end) return "Present";
  if (lateStart == null || lateStart === "" || lateEnd == null || lateEnd === "") return "Absent";
  const lateFrom = parseClockToMinutes(lateStart);
  const lateUntil = parseClockToMinutes(lateEnd);
  if (lateFrom == null || lateUntil == null || lateFrom <= end || lateUntil < lateFrom) {
    throw new Error("Late period start/end must form a valid range after time-in.");
  }
  return scan >= lateFrom && scan <= lateUntil ? "Late" : "Absent";
}

function resolveRecordStatus(record, sessionsByKey) {
  const session = sessionsByKey.get(`${record.section.trim().toLowerCase()}|${record.date}`);
  if (!session) return ["Present", "Late", "Absent"].includes(record.status) ? record.status : "Present";
  const ranges = sessionTimeRanges(session);
  return determineAttendanceStatus(
    record.time,
    ranges.timeInStart,
    ranges.timeInEnd,
    ranges.lateStart,
    ranges.lateEnd,
  );
}

export async function ensureAttendanceSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_groups (
      course VARCHAR(64) NOT NULL,
      year_level TINYINT UNSIGNED NOT NULL,
      block VARCHAR(12) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (course, year_level, block)
    ) CHARACTER SET utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      student_id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      course VARCHAR(64) NOT NULL,
      year_level TINYINT UNSIGNED NOT NULL,
      block VARCHAR(12) NOT NULL,
      descriptor_json LONGTEXT NOT NULL,
      photo MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id VARCHAR(64) PRIMARY KEY,
      student_id VARCHAR(191) NOT NULL,
      student_name VARCHAR(255) NOT NULL,
      attendance_date DATE NOT NULL,
      section VARCHAR(191) NOT NULL,
      attendance_time VARCHAR(32) NOT NULL,
      status ENUM('Present', 'Late', 'Absent') NOT NULL DEFAULT 'Present',
      time_out VARCHAR(32) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY one_checkin_per_class_day (student_id, attendance_date, section),
      KEY attendance_by_date (attendance_date, section)
    ) CHARACTER SET utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id VARCHAR(64) PRIMARY KEY,
      section VARCHAR(191) NOT NULL,
      session_date DATE NOT NULL,
      required_time_in TIME NOT NULL,
      time_in_end TIME NULL,
      late_start TIME NULL,
      late_end TIME NULL,
      grace_period_minutes INT UNSIGNED NULL,
      late_threshold_minutes INT UNSIGNED NULL,
      time_out TIME NULL,
      time_out_end TIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY one_session_per_class_day (section, session_date),
      KEY sessions_by_date (session_date, section)
    ) CHARACTER SET utf8mb4
  `);

  const [[studentColumns], [attendanceColumns], [sessionColumns]] = await Promise.all([
    pool.query("SHOW COLUMNS FROM students"),
    pool.query("SHOW COLUMNS FROM attendance_records"),
    pool.query("SHOW COLUMNS FROM attendance_sessions"),
  ]);
  const studentFields = new Set(studentColumns.map((row) => row.Field));
  if (!studentFields.has("course")) {
    await pool.query("ALTER TABLE students ADD COLUMN course VARCHAR(64) NOT NULL DEFAULT 'BSIT' AFTER email");
  }
  if (!studentFields.has("year_level")) {
    await pool.query("ALTER TABLE students ADD COLUMN year_level TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER course");
  }
  if (!studentFields.has("block")) {
    await pool.query("ALTER TABLE students ADD COLUMN block VARCHAR(12) NOT NULL DEFAULT 'A' AFTER year_level");
  }

  const attendanceByField = Object.fromEntries(attendanceColumns.map((row) => [row.Field, row]));
  if (!attendanceByField.status) {
    await pool.query(
      "ALTER TABLE attendance_records ADD COLUMN status ENUM('Present', 'Late', 'Absent') NOT NULL DEFAULT 'Present' AFTER attendance_time",
    );
  }
  if (!attendanceByField.time_out) {
    await pool.query("ALTER TABLE attendance_records ADD COLUMN time_out VARCHAR(32) NULL AFTER status");
  }

  const sessionFields = new Set(sessionColumns.map((row) => row.Field));
  for (const column of ["time_in_end", "late_start", "late_end", "time_out_end"]) {
    if (!sessionFields.has(column)) {
      await pool.query(`ALTER TABLE attendance_sessions ADD COLUMN ${column} TIME NULL`);
    }
  }
}

function formatMysqlDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function loadAttendanceStore(pool) {
  await ensureAttendanceSchema(pool);
  const [studentRows] = await pool.query(
    "SELECT student_id, name, email, course, year_level, block, descriptor_json, photo FROM students ORDER BY name",
  );
  const [recordRows] = await pool.query(`
    SELECT id, student_id, student_name, DATE_FORMAT(attendance_date, '%Y-%m-%d') AS date,
           section, attendance_time, status, time_out
    FROM attendance_records
    ORDER BY attendance_date DESC, created_at DESC
  `);
  const [classRows] = await pool.query(
    "SELECT course, year_level, block FROM class_groups ORDER BY course, year_level, block",
  );
  const [sessionRows] = await pool.query(`
    SELECT id, section, DATE_FORMAT(session_date, '%Y-%m-%d') AS date,
           TIME_FORMAT(required_time_in, '%H:%i') AS required_time_in,
           grace_period_minutes, late_threshold_minutes,
           TIME_FORMAT(time_in_end, '%H:%i') AS time_in_end,
           TIME_FORMAT(late_start, '%H:%i') AS late_start,
           TIME_FORMAT(late_end, '%H:%i') AS late_end,
           TIME_FORMAT(time_out, '%H:%i') AS time_out,
           TIME_FORMAT(time_out_end, '%H:%i') AS time_out_end
    FROM attendance_sessions
    ORDER BY session_date DESC, section
  `);

  const students = studentRows.map((row) => ({
    studentId: row.student_id,
    name: row.name,
    email: row.email,
    course: row.course,
    yearLevel: row.year_level,
    block: row.block,
    descriptor: typeof row.descriptor_json === "string" ? JSON.parse(row.descriptor_json) : row.descriptor_json,
    photo: row.photo,
  }));
  const records = recordRows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    name: row.student_name,
    date: row.date,
    section: row.section,
    time: row.attendance_time,
    status: row.status || "Present",
    timeOut: row.time_out,
  }));
  const classes = classRows.map((row) => ({
    course: row.course,
    yearLevel: row.year_level,
    block: row.block,
  }));
  const sessions = sessionRows.map((row) => {
    const session = {
      id: row.id,
      section: row.section,
      date: row.date,
      requiredTimeIn: row.required_time_in,
      timeInEnd: row.time_in_end,
      lateStart: row.late_start,
      lateEnd: row.late_end,
      gracePeriodMinutes: row.grace_period_minutes,
      lateThresholdMinutes: row.late_threshold_minutes,
      timeOut: row.time_out,
      timeOutEnd: row.time_out_end,
    };
    const ranges = sessionTimeRanges(session);
    return {
      id: row.id,
      section: row.section,
      date: row.date,
      requiredTimeIn: ranges.timeInStart,
      timeInStart: ranges.timeInStart,
      timeInEnd: ranges.timeInEnd,
      lateStart: ranges.lateStart,
      lateEnd: ranges.lateEnd,
      gracePeriodMinutes: row.grace_period_minutes,
      lateThresholdMinutes: row.late_threshold_minutes,
      timeOut: row.time_out,
      timeOutStart: row.time_out_end ? row.time_out : null,
      timeOutEnd: row.time_out_end,
    };
  });

  return { students, records, classes, sessions };
}

export async function replaceAttendanceStore(pool, storeInput) {
  const store = {
    students: Array.isArray(storeInput?.students) ? storeInput.students : [],
    records: Array.isArray(storeInput?.records) ? storeInput.records : [],
    classes: Array.isArray(storeInput?.classes) ? storeInput.classes : [],
    sessions: Array.isArray(storeInput?.sessions) ? storeInput.sessions : [],
  };

  if (!store.classes.length) {
    const seen = new Set();
    store.classes = [];
    for (const student of store.students) {
      const key = `${String(student.course || "").trim().toLowerCase()}|${student.yearLevel}|${String(student.block || "").trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      store.classes.push({
        course: student.course,
        yearLevel: student.yearLevel,
        block: student.block,
      });
    }
  }

  const studentIds = new Set();
  const studentNames = new Set();
  const studentEmails = new Set();
  for (const student of store.students) {
    const studentId = String(student.studentId || "").trim().toLowerCase();
    const studentName = String(student.name || "").trim().toLowerCase();
    const email = String(student.email || "").trim().toLowerCase();
    if (!studentId || !studentName) {
      const error = new Error("Every student needs a name and student ID.");
      error.statusCode = 422;
      throw error;
    }
    if (studentIds.has(studentId) || studentNames.has(studentName) || (email && studentEmails.has(email))) {
      const error = new Error("Duplicate students, names, or emails are not allowed.");
      error.statusCode = 422;
      throw error;
    }
    studentIds.add(studentId);
    studentNames.add(studentName);
    if (email) studentEmails.add(email);
  }

  for (const record of store.records) {
    if (!studentIds.has(String(record.studentId || "").toLowerCase())) {
      const error = new Error("Attendance records must belong to an enrolled student.");
      error.statusCode = 422;
      throw error;
    }
    if (parseClockToMinutes(record.time) == null) {
      const error = new Error("Each attendance record needs a valid time-in.");
      error.statusCode = 422;
      throw error;
    }
    if (record.timeOut && parseClockToMinutes(record.timeOut) == null) {
      const error = new Error("Attendance record time-out must be a valid time.");
      error.statusCode = 422;
      throw error;
    }
  }

  const classKeys = store.classes.map(
    (item) => `${String(item.course || "").trim().toLowerCase()}|${item.yearLevel}|${String(item.block || "").trim().toLowerCase()}`,
  );
  if (new Set(classKeys).size !== store.classes.length) {
    const error = new Error("Duplicate classes are not allowed.");
    error.statusCode = 422;
    throw error;
  }
  for (const student of store.students) {
    const key = `${String(student.course || "").trim().toLowerCase()}|${student.yearLevel}|${String(student.block || "").trim().toLowerCase()}`;
    if (!classKeys.includes(key)) {
      const error = new Error("Every student must be assigned to an existing class.");
      error.statusCode = 422;
      throw error;
    }
  }

  const sessionKeys = new Set();
  for (const session of store.sessions) {
    const key = `${String(session.section || "").trim().toLowerCase()}|${session.date}`;
    if (sessionKeys.has(key)) {
      const error = new Error("Duplicate attendance sessions are not allowed.");
      error.statusCode = 422;
      throw error;
    }
    const ranges = sessionTimeRanges(session);
    const start = parseClockToMinutes(ranges.timeInStart);
    const end = parseClockToMinutes(ranges.timeInEnd);
    if (start == null || end == null || end <= start) {
      const error = new Error("Each session needs a valid time-in start and end.");
      error.statusCode = 422;
      throw error;
    }
    sessionKeys.add(key);
  }

  const sessionsByKey = new Map(
    store.sessions.map((session) => [`${String(session.section || "").trim().toLowerCase()}|${session.date}`, session]),
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureAttendanceSchema(connection);
    await connection.query("DELETE FROM attendance_records");
    await connection.query("DELETE FROM attendance_sessions");
    await connection.query("DELETE FROM students");
    await connection.query("DELETE FROM class_groups");

    if (store.classes.length) {
      await connection.query(
        "INSERT INTO class_groups (course, year_level, block) VALUES ?",
        [store.classes.map((item) => [String(item.course).trim(), item.yearLevel, String(item.block).trim().toUpperCase()])],
      );
    }
    if (store.students.length) {
      await connection.query(
        `INSERT INTO students
          (student_id, name, email, course, year_level, block, descriptor_json, photo)
         VALUES ?`,
        [store.students.map((student) => [
          student.studentId,
          student.name,
          student.email || "",
          student.course,
          student.yearLevel,
          student.block,
          JSON.stringify(student.descriptor || []),
          student.photo || "",
        ])],
      );
    }
    if (store.sessions.length) {
      await connection.query(
        `INSERT INTO attendance_sessions
          (id, section, session_date, required_time_in, time_in_end,
           late_start, late_end, grace_period_minutes, late_threshold_minutes,
           time_out, time_out_end)
         VALUES ?`,
        [store.sessions.map((session) => {
          const ranges = sessionTimeRanges(session);
          return [
            session.id,
            String(session.section).trim(),
            formatMysqlDate(session.date),
            formatTimeHhmm(ranges.timeInStart),
            formatTimeHhmm(ranges.timeInEnd),
            formatTimeHhmm(ranges.lateStart),
            formatTimeHhmm(ranges.lateEnd),
            session.gracePeriodMinutes ?? null,
            session.lateThresholdMinutes ?? null,
            formatTimeHhmm(session.timeOutStart || session.timeOut),
            formatTimeHhmm(session.timeOutEnd),
          ];
        })],
      );
    }
    if (store.records.length) {
      await connection.query(
        `INSERT INTO attendance_records
          (id, student_id, student_name, attendance_date, section, attendance_time, status, time_out)
         VALUES ?`,
        [store.records.map((record) => [
          record.id,
          record.studentId,
          record.name,
          formatMysqlDate(record.date),
          record.section,
          record.time,
          resolveRecordStatus(record, sessionsByKey),
          record.timeOut || null,
        ])],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    students: store.students.length,
    records: store.records.length,
    classes: store.classes.length,
    sessions: store.sessions.length,
  };
}
